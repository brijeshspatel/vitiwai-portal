import Link from 'next/link';
import { SimulatedNotice } from '@/components/SimulatedNotice';

export default function HomePage() {
  return (
    <>
      {/*
        The measure cap belongs on the paragraph, not the card. On the card it
        made the page header 587px wide beside 1068px siblings, which reads as a
        layout fault rather than as a reading width.
      */}
      <div className="vw-card">
        <h1>Do it online, not on the telephone</h1>
        <p className="vw-prose">
          Open an account, check what you owe, pay a bill, compare plans and report a fault. The
          call centre is open eight hours a day; this is open all of them.
        </p>
      </div>

      <SimulatedNotice what="this whole site">
        Vitiwai Utilities is a fictional company built to demonstrate a delivery workflow. Every
        customer, invoice and plan is generated. Payments are never real.
      </SimulatedNotice>

      <div className="vw-grid">
        {/*
          This card described the build, not the service: it was headed
          "Increment 1A" and told the customer which increments the remaining
          workflows would arrive in. A customer has no idea what an increment is,
          and by the time anyone read it the claim was also untrue.
        */}
        <section className="vw-card">
          <h2>Open an account</h2>
          <p className="vw-muted">
            Join in a few minutes with a photograph of your identity document.
          </p>
          <p>
            <Link className="vw-button" href="/join">
              Open an account
            </Link>
          </p>
        </section>
        <section className="vw-card">
          <h2>Compare plans</h2>
          <p className="vw-muted">
            Twelve water, broadband and bundle plans, searchable and filterable.
          </p>
          <p>
            <Link className="vw-button" href="/plans">
              Browse plans
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
