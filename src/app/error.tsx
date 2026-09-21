'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="vw-card vw-prose" role="alert">
      <h1>Something went wrong</h1>
      <p className="vw-error">{error.message}</p>
      <p className="vw-muted">
        This is usually the local stack not running. Try <code>npm run stack:up</code>, then reload.
      </p>
      <button className="vw-button" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
