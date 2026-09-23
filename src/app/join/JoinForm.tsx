import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from '@/domain/upload';

/**
 * The onboarding form.
 *
 * Every field has a programmatic label, and the file input states what it
 * accepts and how large a file may be - before the upload is attempted rather
 * than as an error afterwards.
 */
export function JoinForm({
  error,
  csrfToken,
  acceptsDocument = true,
}: {
  error?: string;
  csrfToken?: string;
  /**
   * False in a build that accepts no identity document.
   *
   * The field is not rendered at all rather than disabled or hidden. A disabled
   * input can be re-enabled from the console and a hidden one still posts, and
   * neither would change the fact that the risk here is a real passport
   * arriving at a public URL. The handler reads nothing either way; this is the
   * half a person sees.
   */
  acceptsDocument?: boolean;
}) {
  return (
    <form className="vw-card" method="post" encType="multipart/form-data" action="/join/submit">
        <input type="hidden" name="_csrf" value={csrfToken ?? ''} />
      <h1>Open an account</h1>
      <p className="vw-muted vw-prose">
        {acceptsDocument
          ? 'Give your details exactly as they appear on your identity document, and upload a photograph of it.'
          : 'Give your details exactly as they appear on your identity document.'}
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

      {acceptsDocument ? (
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
      ) : (
        <p className="vw-muted vw-prose" role="note">
          <strong>This demonstration does not accept identity documents.</strong> The portal
          normally asks for a photograph of one and reads it. Anyone can reach this address, and a
          public form asking for a passport will eventually be sent a real one - so this build
          renders no upload field and reads no file. Your application is decided from the details
          above.
        </p>
      )}

      <p>
        <button className="vw-button" type="submit">
          Open my account
        </button>
      </p>
    </form>
  );
}
