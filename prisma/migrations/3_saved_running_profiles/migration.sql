-- CreateTable: saved_running_profiles
-- One row per user (UNIQUE on user_id). Upserted by saveRunningProfileAction.

CREATE TABLE "saved_running_profiles" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"         TEXT NOT NULL,
    "model_version"   TEXT NOT NULL DEFAULT 'running-v2.4-candidate',
    -- Source inputs (for profiler form prefill)
    "sprint_dist_m"   DOUBLE PRECISION NOT NULL,
    "sprint_time_s"   DOUBLE PRECISION NOT NULL DEFAULT 20,
    "three_min_dist_m" DOUBLE PRECISION NOT NULL,
    "six_min_dist_m"  DOUBLE PRECISION NOT NULL,
    "mass_kg"         DOUBLE PRECISION NOT NULL,
    "body_fat_pct"    DOUBLE PRECISION NOT NULL,
    -- Derived outputs (for fueling prefill)
    "lt1_speed_ms"    DOUBLE PRECISION NOT NULL,
    "mlss_speed_ms"   DOUBLE PRECISION NOT NULL,
    "vlamax"          DOUBLE PRECISION NOT NULL,
    "vo2max_ml_kg_min" DOUBLE PRECISION NOT NULL,
    -- Athlete context
    "sex"             TEXT,
    "name"            TEXT,
    "age"             INTEGER,
    "diet_type"       TEXT,
    "saved_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "result_json"     JSONB NOT NULL,

    CONSTRAINT "saved_running_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_running_profiles_user_id_key" ON "saved_running_profiles"("user_id");

ALTER TABLE "saved_running_profiles"
    ADD CONSTRAINT "saved_running_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
