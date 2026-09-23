import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from './Nav';
import './globals.css';
import { DemonstrationBanner } from '@/components/DemonstrationBanner';
import { loadEnv } from '@/config/env';

export const metadata: Metadata = {
  title: {
    default: 'Vitiwai Utilities - self-service',
    template: '%s | Vitiwai Utilities',
  },
  description:
    'Open an account, see what you owe, pay a bill and report a fault. A demonstration portal using synthetic data only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-FJ">
      <body>
        <div className="vw-shell">
          {/* The skip link is the first focusable element, and its target exists. */}
          <a className="vw-skip-link" href="#main">
            Skip to main content
          </a>
          {loadEnv().DEMO_MODE && <DemonstrationBanner />}

          <header className="vw-header">
            <div className="vw-header__inner">
              <Link className="vw-brand" href="/">
                Vitiwai Utilities
                <span>Water and broadband, Fiji</span>
              </Link>
              <Nav />
            </div>
          </header>

          <main className="vw-main" id="main">
            {children}
          </main>

          <footer className="vw-footer">
            <div className="vw-footer__inner">
              <p>
                Vitiwai Utilities is a fictional company. Every customer, address, invoice and plan
                on this site is synthetic. No real person and no real money is involved.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
