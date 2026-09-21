export const metadata = { title: 'Support' };

export default function SupportPage() {
  return (
    <div className="vw-card vw-prose">
      <h1>Support</h1>
      <p>Report a fault, or ask about a plan change.</p>
      <p className="vw-muted">
        Fault reports arrive in increment 1D, with deliverable 7. A fault becomes a task in the
        operator&apos;s own system, and a plan change becomes a lead.
      </p>
    </div>
  );
}
