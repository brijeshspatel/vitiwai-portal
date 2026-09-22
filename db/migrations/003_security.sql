-- Increment 1E. The two tables the security controls need.
--
-- Both are additive: dropping them restores the previous schema without
-- touching a row of existing data, which is what makes this migration safe to
-- roll back.

-- Rate limiting, as a fixed-window counter.
--
-- In the portal's own PostgreSQL rather than in memory, for two reasons. A map
-- in the process is lost on restart and wrong the moment a second instance
-- exists; and it cannot be tested across a process boundary, so the test would
-- be reading the same map the code just wrote. There is no Redis in this
-- stack, and adding one costs a container on a measured machine.
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket       TEXT        NOT NULL,   -- which limit: 'signin-email', 'upload-address', ...
  key          TEXT        NOT NULL,   -- who: an address, an email
  window_start TIMESTAMPTZ NOT NULL,   -- truncated to the window
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);

-- Old windows are never read again. This index makes clearing them cheap.
CREATE INDEX IF NOT EXISTS rate_limit_window_idx ON rate_limit (window_start);

-- The audit trail.
--
-- Append-only, and written by the code that changes the state rather than by a
-- trigger: a trigger sees the row change but not the actor, the request or the
-- intent, which is most of what an audit entry is for.
CREATE TABLE IF NOT EXISTS audit_event (
  id           BIGSERIAL   PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action       TEXT        NOT NULL,   -- 'signin.succeeded', 'payment.recorded', ...
  actor_user   BIGINT      NULL REFERENCES portal_user(id) ON DELETE SET NULL,
  subject_type TEXT        NOT NULL,   -- 'session', 'invoice', 'application', ...
  subject_id   TEXT        NULL,
  detail       JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_event_occurred_idx ON audit_event (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_actor_idx ON audit_event (actor_user);

-- `detail` carries no credential and no uploaded image. The trail records that
-- a thing happened; it is not a second copy of the sensitive thing itself, and
-- a test asserts so.
COMMENT ON COLUMN audit_event.detail IS
  'Context only. Never a password, token, session id or document image.';
