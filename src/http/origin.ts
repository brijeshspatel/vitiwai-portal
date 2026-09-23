import type { NextRequest } from 'next/server';

/**
 * The address the visitor actually used.
 *
 * Every mutating handler answers with a 303 to somewhere else, and the URL in
 * that response has to be one the visitor's browser can reach.
 * `request.nextUrl.origin` is the address the *server* was reached on, which on
 * a developer's machine is `http://localhost:3000` and is therefore correct by
 * coincidence.
 *
 * Behind a host it is not. A container receives the request on its own
 * hostname and port, so a sign-in redirected the browser to
 * `http://10cdaa8c3c2e:3000/account` - an address that exists only inside the
 * container network. Measured 2026-09-23 against the demonstration image; every
 * form in the portal would have ended at an unreachable page.
 *
 * The forwarded headers carry what the visitor asked for. They are only
 * trustworthy behind a proxy that sets them - anyone can send them directly -
 * so this is used to build a redirect back to this same site and never to make
 * a security decision.
 */
export function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (!forwardedHost) return request.nextUrl.origin;

  // A chain of proxies produces a comma-separated list, oldest first. The first
  // entry is what the visitor typed.
  const host = forwardedHost.split(',')[0]!.trim();
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(':', '');

  // A host header carrying anything but a host and a port is not one this will
  // build a URL from; falling back is safer than trusting it.
  if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(host)) return request.nextUrl.origin;

  return `${proto}://${host}`;
}
