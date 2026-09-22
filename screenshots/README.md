# Screenshots

The Vitiwai Utilities customer portal, captured from the running application on
2026-09-22 at version 0.5.0.

**Every figure, name, address and invoice in these images is synthetic.** No real
person and no real money appears anywhere. Payment and identity verification are
simulated, and each is labelled as such on screen.

Regenerate with `npm run build && npm start`, then `npm run screenshots`. The
images and this index are written together, so the list cannot drift from what
was captured.

| Image | What it shows | Viewport |
|---|---|---|
| [`01-home.png`](01-home.png) | Home | 1440x900 |
| [`02-plans.png`](02-plans.png) | Plans, unfiltered | 1440x900 |
| [`03-plans-filtered.png`](03-plans-filtered.png) | Plans, filtered to broadband under FJ$120 | 1440x900 |
| [`04-join.png`](04-join.png) | Opening an account | 1440x900 |
| [`05-signin.png`](05-signin.png) | Signing in | 1440x900 |
| [`06-account.png`](06-account.png) | The account dashboard | 1440x900 |
| [`07-pay.png`](07-pay.png) | Paying a bill | 1440x900 |
| [`08-support.png`](08-support.png) | Reporting a fault, and the cases already open | 1440x900 |
| [`09-change-plan.png`](09-change-plan.png) | Asking to change plan | 1440x900 |
| [`10-not-found.png`](10-not-found.png) | A page that does not exist | 1440x900 |
| [`11-phone-home.png`](11-phone-home.png) | Home on a phone | 390x844 |
| [`12-phone-menu.png`](12-phone-menu.png) | The menu open on a phone | 390x844 |
| [`13-phone-account.png`](13-phone-account.png) | The dashboard on a phone | 390x844 |
| [`14-phone-plans.png`](14-phone-plans.png) | Plans on a phone | 390x844 |

## What to look at

* **The navigation reflects the session.** Signed out it offers "Open an account"
  and "Sign in"; signed in it offers "My account", "Support" and "Sign out".
* **The usage table is a table**, not a picture of one. Every figure is readable
  as text, and the bars are decoration that assistive technology never sees.
* **Simulated capabilities are labelled** on the page the customer meets them on,
  not only in the documentation.
* **The phone layout is a layout**, not a squeezed desktop: the navigation
  becomes a menu, the grids stack, and the usage bars give way to the figures.
