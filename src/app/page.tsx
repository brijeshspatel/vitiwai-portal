import { SimulatedNotice } from '@/components/SimulatedNotice';

export default function HomePage() {
  return (
    <>
      <div className="vw-card vw-prose">
        <h1>Do it online, not on the telephone</h1>
        <p>
          Open an account, check what you owe, pay a bill, compare plans and report a fault. The
          call centre is open eight hours a day; this is open all of them.
        </p>
      </div>

      <SimulatedNotice what="this whole site">
        Vitiwai Utilities is a fictional company built to demonstrate a delivery workflow. Every
        customer, invoice and plan is generated. Payments are never real.
      </SimulatedNotice>

      <div className="vw-grid">
        <section className="vw-card">
          <h2>Increment 1A</h2>
          <p className="vw-muted">
            The container stack, this application shell and the synthetic dataset. The five customer
            workflows arrive in increments 1B to 1E.
          </p>
        </section>
        <section className="vw-card">
          <h2>Compare plans</h2>
          <p className="vw-muted">
            Twelve water, broadband and bundle plans, searchable and filterable.
          </p>
          <p>
            <a className="vw-button" href="/plans">
              Browse plans
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
