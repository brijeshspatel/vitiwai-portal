-- Increment 1C. Sessions, and the payment record that makes paying twice
-- structurally impossible.

CREATE TABLE IF NOT EXISTS portal_session (
  id         TEXT        PRIMARY KEY,   -- 256 bits of entropy, base64url. Encodes nothing.
  user_id    BIGINT      NOT NULL REFERENCES portal_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS portal_session_user_idx ON portal_session (user_id);

CREATE TABLE IF NOT EXISTS payment (
  id              BIGSERIAL   PRIMARY KEY,
  idempotency_key TEXT        NOT NULL UNIQUE,
  user_id         BIGINT      NOT NULL REFERENCES portal_user(id),
  invoice_id      TEXT        NOT NULL,
  amount_minor    BIGINT      NOT NULL CHECK (amount_minor > 0),
  status          TEXT        NOT NULL CHECK (status IN ('succeeded', 'declined')),
  intent_id       TEXT,
  receipt_id      TEXT,
  decline_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The backstop. The idempotency key stops a repeated request; this stops
-- everything else - two tabs, two keys, one invoice. At most one successful
-- payment per invoice, whatever the request layer does.
CREATE UNIQUE INDEX IF NOT EXISTS payment_one_success_per_invoice
  ON payment (invoice_id) WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS payment_user_idx ON payment (user_id);
