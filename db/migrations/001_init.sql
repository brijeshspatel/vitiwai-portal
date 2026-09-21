-- Increment 1B. The portal's own data: what Odoo does not own.
--
-- No column here holds an uploaded image. The extracted text and the decision
-- are kept because a later reviewer needs them; the document itself is not,
-- because nothing needs it and keeping it models the wrong habit.

CREATE TABLE IF NOT EXISTS portal_user (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  odoo_partner_id TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_application (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT        NOT NULL,
  outcome        TEXT        NOT NULL CHECK (outcome IN ('approved', 'referred', 'declined')),
  reasons        TEXT[]      NOT NULL DEFAULT '{}',
  extracted_text TEXT,
  confidence     REAL,
  odoo_lead_id   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_application_email_idx ON onboarding_application (email);
