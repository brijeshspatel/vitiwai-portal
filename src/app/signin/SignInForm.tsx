export function SignInForm({ error, next }: { error?: string; next?: string }) {
  return (
    <form className="vw-card" method="post" action="/signin/submit">
      <h1>Sign in</h1>
      <p className="vw-muted vw-prose">
        Use the email address and password you chose when you opened your account.
      </p>

      {error !== undefined && (
        <p className="vw-error" role="alert">
          {error}
        </p>
      )}

      {next !== undefined && <input type="hidden" name="next" value={next} />}

      <p>
        <label htmlFor="email">Email address</label>
        <br />
        <input id="email" name="email" type="email" required autoComplete="email" />
      </p>

      <p>
        <label htmlFor="password">Password</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </p>

      <p>
        <button className="vw-button" type="submit">
          Sign in
        </button>
      </p>

      <p className="vw-muted">
        No account yet? <a href="/join">Open one</a>.
      </p>
    </form>
  );
}
