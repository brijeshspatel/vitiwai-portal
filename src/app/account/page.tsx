export const metadata = { title: 'My account' };

export default function AccountPage() {
  return (
    <div className="vw-card vw-prose">
      <h1>My account</h1>
      <p>
        The account dashboard shows your balance, your current invoice and twelve months of usage.
      </p>
      <p className="vw-muted">
        It arrives in increment 1C, with deliverables 5 and 6. The data it will read is already
        seeded in the local stack.
      </p>
    </div>
  );
}
