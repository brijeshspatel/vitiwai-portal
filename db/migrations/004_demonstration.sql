-- Tables the demonstration composition needs, and the real one does not.
--
-- When DEMO_MODE is off, Odoo is the system of record for customers and
-- support cases and nothing here is read or written. The migration still runs:
-- two empty tables cost nothing, and a migration that runs only sometimes is a
-- migration whose state nobody can predict.

-- Customers created by onboarding in a demonstration.
--
-- The seeded customers are generated in process and are not stored - they are
-- the same on every restart, so storing them would only create a second copy to
-- drift. An applicant who opens an account is different: they expect to find
-- their account still there afterwards.
CREATE TABLE IF NOT EXISTS demo_customer (
  id          BIGSERIAL   PRIMARY KEY,
  email       TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  phone       TEXT,
  city        TEXT,
  street      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support cases raised in a demonstration.
--
-- Held rather than generated, because a request that vanished on refresh would
-- read as a defect in the portal rather than as an absent back end.
CREATE TABLE IF NOT EXISTS demo_support_case (
  id          BIGSERIAL   PRIMARY KEY,
  customer_id TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  -- The four the portal declares. There is deliberately no 'new': Odoo has no
  -- such state and a just-opened task is in progress, so the demonstration
  -- matches rather than inventing a state the real adapter cannot produce.
  status      TEXT        NOT NULL DEFAULT 'in_progress'
              CHECK (status IN ('waiting', 'in_progress', 'resolved', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_support_case_customer
  ON demo_support_case (customer_id, created_at DESC);
