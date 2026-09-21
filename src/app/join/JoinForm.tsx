import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from '@/domain/upload';

/**
 * The onboarding form.
 *
 * Every field has a programmatic label, and the file input states what it
 * accepts and how large a file may be - before the upload is attempted rather
 * than as an error afterwards.
 */
export function JoinForm({ error }: { error?: string }) {
  return (
    <form className="vw-card" method="post" encType="multipart/form-data" action="/join">
      <h1>Open an account</h1>
      <p className="vw-muted vw-prose">
        Give your details exactly as they appear on your identity document, and upload a photograph
        of it.
      </p>

      {error !== undefined && (
        <p className="vw-error" role="alert">
          {error}
        </p>
      )}

      <p>
        <label htmlFor="fullName">Full name, as printed on the document</label>
        <br />
        <input id="fullName" name="fullName" type="text" required autoComplete="name" />
      </p>

      <p>
        <label htmlFor="dateOfBirth">Date of birth</label>
        <br />
        <input id="dateOfBirth" name="dateOfBirth" type="date" required autoComplete="bday" />
      </p>

      <p>
        <label htmlFor="documentNumber">Document number</label>
        <br />
        <input id="documentNumber" name="documentNumber" type="text" required />
      </p>

      <p>
        <label htmlFor="email">Email address</label>
        <br />
        <input id="email" name="email" type="email" required autoComplete="email" />
      </p>

      <p>
        <label htmlFor="password">Choose a password</label>
        <br />
        <input id="password" name="password" type="password" required autoComplete="new-password" />
      </p>

      <p>
        <label htmlFor="document">Photograph of your identity document</label>
        <br />
        <input
          id="document"
          name="document"
          type="file"
          required
          accept={ACCEPTED_TYPES.join(',')}
          aria-describedby="document-help"
        />
        <br />
        <span id="document-help" className="vw-muted">
          PNG or JPEG, up to {MAX_UPLOAD_BYTES / (1024 * 1024)} MB. Your photograph is read and
          then discarded; it is never stored.
        </span>
      </p>

      <p>
        <button className="vw-button" type="submit">
          Open my account
        </button>
      </p>
    </form>
  );
}
