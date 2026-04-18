-- CreateTable
CREATE TABLE "users" (
  "id"         TEXT         NOT NULL,
  "email"      TEXT         NOT NULL,
  "name"       TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "subscriptions" (
  "id"                   TEXT         NOT NULL,
  "user_id"              TEXT         NOT NULL,
  "tier"                 TEXT         NOT NULL DEFAULT 'free',
  "stripe_customer_id"   TEXT,
  "stripe_sub_id"        TEXT,
  "stripe_price_id"      TEXT,
  "current_period_end"   TIMESTAMP(3),
  "cancel_at_period_end" BOOLEAN      NOT NULL DEFAULT false,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateTable
CREATE TABLE "athlete_profiles" (
  "id"           TEXT             NOT NULL,
  "user_id"      TEXT             NOT NULL,
  "name"         TEXT             NOT NULL,
  "sex"          TEXT             NOT NULL,
  "weight_kg"    DOUBLE PRECISION NOT NULL,
  "body_fat_pct" DOUBLE PRECISION NOT NULL,
  "created_at"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscyd_results" (
  "id"                 TEXT             NOT NULL,
  "user_id"            TEXT             NOT NULL,
  "athlete_profile_id" TEXT,
  "created_at"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "p20s_watts"         DOUBLE PRECISION NOT NULL,
  "p300_watts"         DOUBLE PRECISION NOT NULL,
  "p12min_watts"       DOUBLE PRECISION,
  "body_mass_kg"       DOUBLE PRECISION NOT NULL,
  "body_fat_pct"       DOUBLE PRECISION NOT NULL,
  "vo2max"             DOUBLE PRECISION NOT NULL,
  "vlamax"             DOUBLE PRECISION NOT NULL,
  "ftp_watts"          DOUBLE PRECISION NOT NULL,
  "cp_watts"           DOUBLE PRECISION NOT NULL,
  "w_prime_j"          DOUBLE PRECISION NOT NULL,
  "mlss_watts"         DOUBLE PRECISION NOT NULL,
  "lt1_watts"          DOUBLE PRECISION NOT NULL,
  "phenotype"          TEXT             NOT NULL,
  "result_json"        JSONB            NOT NULL,
  CONSTRAINT "inscyd_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fueling_results" (
  "id"                 TEXT             NOT NULL,
  "user_id"            TEXT             NOT NULL,
  "inscyd_result_id"   TEXT,
  "athlete_profile_id" TEXT,
  "created_at"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "athlete_level"      TEXT             NOT NULL,
  "diet_type"          TEXT             NOT NULL,
  "ftp_watts"          DOUBLE PRECISION NOT NULL,
  "target_watts"       DOUBLE PRECISION NOT NULL,
  "target_cho_g_h"     DOUBLE PRECISION NOT NULL,
  "cho_required_g_h"   DOUBLE PRECISION NOT NULL,
  "cho_gap_g_h"        DOUBLE PRECISION NOT NULL,
  "gap_zone"           TEXT             NOT NULL,
  "fatmax_wkg"         DOUBLE PRECISION NOT NULL,
  "result_json"        JSONB            NOT NULL,
  CONSTRAINT "fueling_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "subscriptions"    ADD CONSTRAINT "subscriptions_user_id_fkey"              FOREIGN KEY ("user_id")            REFERENCES "users"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_user_id_fkey"           FOREIGN KEY ("user_id")            REFERENCES "users"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "inscyd_results"   ADD CONSTRAINT "inscyd_results_user_id_fkey"             FOREIGN KEY ("user_id")            REFERENCES "users"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "inscyd_results"   ADD CONSTRAINT "inscyd_results_athlete_profile_id_fkey"  FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fueling_results"  ADD CONSTRAINT "fueling_results_user_id_fkey"            FOREIGN KEY ("user_id")            REFERENCES "users"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "fueling_results"  ADD CONSTRAINT "fueling_results_inscyd_result_id_fkey"   FOREIGN KEY ("inscyd_result_id")   REFERENCES "inscyd_results"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fueling_results"  ADD CONSTRAINT "fueling_results_athlete_profile_id_fkey" FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
