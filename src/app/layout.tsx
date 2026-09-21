import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Vitiwai Utilities - self-service',
    template: '%s | Vitiwai Utilities',
  },
  description:
    'Open an account, see what you owe, pay a bill and report a fault. A demonstration portal using synthetic data only.',
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/plans', label: 'Plans' },
  { href: '/account', label: 'My account' },
  { href: '/support', label: 'Support' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-FJ">
      <body>
        <div className="vw-shell">
          {/* The skip link is the first focusable element, and its target exists. */}
          <a className="vw-skip-link" href="#main">
            Skip to main content
          </a>

          <header className="vw-header">
            <div className="vw-header__inner">
              <a className="vw-brand" href="/">
                Vitiwai Utilities
                <span>Water and broadband, Fiji</span>
              </a>
              <nav className="vw-nav" aria-label="Main">
                <ul>
                  {NAV.map((item) => (
                    <li key={item.href}>
                      <a href={item.href}>{item.label}</a>
                    </li>
                  ))}
                </ul>
              </nav>
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
