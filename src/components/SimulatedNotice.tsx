/**
 * Marks a simulated capability on the screen where a user meets it.
 *
 * Specification section 5 requires every simulated capability to be labelled in
 * three places: here, in the README, and in a comment on the adapter.
 */
export function SimulatedNotice({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <aside className="vw-simulated" aria-label={`${what} is simulated`}>
      <strong>Simulated: {what}</strong>
      <span className="vw-muted">{children}</span>
    </aside>
  );
}
