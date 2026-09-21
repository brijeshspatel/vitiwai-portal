import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="vw-card vw-prose">
      <h1>That page is not here</h1>
      <p>The address may be mistyped, or the page may have moved.</p>
      <p>
        <Link href="/">Return to the home page</Link>
      </p>
    </div>
  );
}
