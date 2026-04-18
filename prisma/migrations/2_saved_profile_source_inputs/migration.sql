-- ─────────────────────────────────────────────────────────────────
-- Migration: 2_saved_profile_source_inputs
--
-- Expands saved_profiles to store profiler source inputs alongside
-- derived outputs, so the Power Profiler form can be prefilled
-- exactly as entered without reverse-deriving from outputs.
--
-- Changes:
--   saved_profiles — add p20_watts, p300_watts (required source inputs)
--   saved_profiles — add p180_watts, p360_watts, p720_watts (optional)
--   saved_profiles — add cp_watts (derived, not previously persisted)
--
-- Backfill: rows saved before this migration will have NULL source
--   inputs. The profiler page handles this gracefully — only body
--   composition and athlete context are prefilled from those rows.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE saved_profiles
  ADD COLUMN IF NOT EXISTS p20_watts   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p300_watts  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p180_watts  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p360_watts  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS p720_watts  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cp_watts    DOUBLE PRECISION;

-- ─────────────────────────────────────────────────────────────────
-- BACKFILL (optional — run after ALTER succeeds)
-- Attempts to extract source inputs from result_json for rows that
-- already have a stored profile. result_json structure mirrors
-- MetabolicV06Result: { inputs: { p20, p300, p180, p360, p720 },
--                       outputs: { cpWatts } }
-- Safe to re-run (WHERE p20_watts IS NULL guard).
-- ─────────────────────────────────────────────────────────────────

UPDATE saved_profiles SET
  p20_watts  = (result_json -> 'inputs' ->> 'p20')::DOUBLE PRECISION,
  p300_watts = (result_json -> 'inputs' ->> 'p300')::DOUBLE PRECISION,
  p180_watts = (result_json -> 'inputs' ->> 'p180')::DOUBLE PRECISION,
  p360_watts = (result_json -> 'inputs' ->> 'p360')::DOUBLE PRECISION,
  p720_watts = (result_json -> 'inputs' ->> 'p720')::DOUBLE PRECISION,
  cp_watts   = (result_json -> 'outputs' ->> 'cpWatts')::DOUBLE PRECISION
WHERE p20_watts IS NULL
  AND result_json IS NOT NULL;
