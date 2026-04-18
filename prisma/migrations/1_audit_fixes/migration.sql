-- ─────────────────────────────────────────────────────────────────
-- Migration: 1_audit_fixes
-- Audit Phase 1–4 (E-implementation-plan.md)
--
-- Changes:
--   fueling_results  — add 13 missing scalar columns
--   fueling_results  — make gap_zone nullable (soft deprecation)
--   inscyd_results   — add 3 missing 4PT power columns
--   indexes          — add user_id/created_at, event_category, strategy_label
--
-- After running: execute the backfill UPDATE statements below
--   to populate new columns from result_json for existing rows.
-- ─────────────────────────────────────────────────────────────────

-- ── fueling_results: input scalars ───────────────────────────────

ALTER TABLE fueling_results
  ADD COLUMN IF NOT EXISTS weight_kg      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS body_fat_pct   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS sex            TEXT,
  ADD COLUMN IF NOT EXISTS vlamax         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS event_category TEXT;

-- ── fueling_results: derived anchors ─────────────────────────────

ALTER TABLE fueling_results
  ADD COLUMN IF NOT EXISTS gross_efficiency  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fatmax_watts      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS carb90_watts      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS carb90_found      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS target_pct_lt2    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cho_gph_at_target DOUBLE PRECISION;

-- ── fueling_results: strategy classification ──────────────────────

ALTER TABLE fueling_results
  ADD COLUMN IF NOT EXISTS strategy_label   TEXT,
  ADD COLUMN IF NOT EXISTS pacing_alignment TEXT;

-- ── fueling_results: soft-deprecate gap_zone (make nullable) ─────
-- Allows the API to stop writing it without breaking existing rows.
-- Column is retained until confirmed no reads depend on it.

ALTER TABLE fueling_results
  ALTER COLUMN gap_zone DROP NOT NULL;

-- ── inscyd_results: 4PT power columns ────────────────────────────
-- p300_watts and p12min_watts are retained (legacy 3PT compat).

ALTER TABLE inscyd_results
  ADD COLUMN IF NOT EXISTS p180_watts DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p360_watts DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p720_watts DOUBLE PRECISION;

-- ── Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fueling_results_user_created
  ON fueling_results (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fueling_results_event_category
  ON fueling_results (event_category);

CREATE INDEX IF NOT EXISTS idx_fueling_results_strategy_label
  ON fueling_results (strategy_label);

-- ─────────────────────────────────────────────────────────────────
-- BACKFILL (run separately after ALTER statements succeed)
-- Populates new scalar columns from result_json for existing rows.
-- Safe to re-run (uses WHERE to skip already-filled rows).
-- ─────────────────────────────────────────────────────────────────

UPDATE fueling_results SET
  weight_kg         = (result_json -> 'inputs' ->> 'weight')::DOUBLE PRECISION,
  body_fat_pct      = (result_json -> 'inputs' ->> 'bodyFat')::DOUBLE PRECISION,
  sex               = (result_json -> 'inputs' ->> 'sex'),
  vlamax            = (result_json -> 'inputs' ->> 'vlamax')::DOUBLE PRECISION,
  event_category    = (result_json -> 'inputs' ->> 'eventType'),
  gross_efficiency  = (result_json ->> 'ge')::DOUBLE PRECISION,
  fatmax_watts      = ROUND(
                        (result_json ->> 'fatmaxPctMLSS')::DOUBLE PRECISION *
                        (result_json -> 'inputs' ->> 'mlssWatts')::DOUBLE PRECISION
                      ),
  carb90_watts      = CASE
                        WHEN (result_json -> 'carb90' ->> 'found')::BOOLEAN = TRUE
                        THEN (result_json -> 'carb90' ->> 'watts')::DOUBLE PRECISION
                        ELSE NULL
                      END,
  carb90_found      = COALESCE((result_json -> 'carb90' ->> 'found')::BOOLEAN, FALSE),
  target_pct_lt2    = (result_json -> 'target' ->> 'pctMLSS')::DOUBLE PRECISION,
  cho_gph_at_target = (result_json -> 'target' ->> 'choGHour')::DOUBLE PRECISION,
  strategy_label    = (result_json -> 'advice' -> 'strategy' ->> 'strategyLabel'),
  pacing_alignment  = (result_json -> 'advice' -> 'strategy' ->> 'alignment')
WHERE weight_kg IS NULL;

UPDATE inscyd_results SET
  p180_watts = (result_json -> 'inputs' ->> 'p180')::DOUBLE PRECISION,
  p360_watts = (result_json -> 'inputs' ->> 'p360')::DOUBLE PRECISION,
  p720_watts = (result_json -> 'inputs' ->> 'p720')::DOUBLE PRECISION
WHERE p180_watts IS NULL
  AND result_json -> 'inputs' ? 'p180';
