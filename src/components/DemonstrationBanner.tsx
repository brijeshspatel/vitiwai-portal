/**
 * What this build is, said before anything else on the page.
 *
 * The footer already carries a synthetic-data notice. This is stronger and it
 * is above the content rather than below it, because a reviewer who reads one
 * page and forms a view of the project will read the top of it.
 *
 * It is a `role="note"` in a landmark rather than an alert: it is not urgent
 * and it is not an error, and announcing it as either on every page would be
 * worse for a screen-reader user than saying it plainly once per page.
 */
export function DemonstrationBanner() {
  return (
    <aside className="vw-demo-banner" role="note" aria-label="About this demonstration">
      <p>
        <strong>This is a demonstration.</strong> Every customer, address, invoice and plan is
        synthetic, and the systems behind it are simulated - there is no real utility, no real
        money and no real identity check. It accepts no identity documents.
      </p>
    </aside>
  );
}
