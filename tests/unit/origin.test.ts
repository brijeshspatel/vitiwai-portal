import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requestOrigin } from '@/http/origin';

/**
 * Where a redirect sends the visitor.
 *
 * Every form in the portal answers with a 303, and until this existed the
 * address came from the server's own view of itself. On a developer's machine
 * that is `http://localhost:3000` and right by coincidence; in a container it
 * is the container's hostname, and every form ended at an address reachable
 * only from inside the container network.
 */

const make = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(new Request(url, { headers }));

describe('the origin a redirect is built from', () => {
  it('uses the request URL when nothing is forwarded', () => {
    expect(requestOrigin(make('http://localhost:3000/signin/submit'))).toBe(
      'http://localhost:3000',
    );
  });

  it('prefers the host the visitor asked for', () => {
    const request = make('http://10cdaa8c3c2e:3000/signin/submit', {
      'x-forwarded-host': 'portal.example.com',
      'x-forwarded-proto': 'https',
    });
    // The exact failure this was written for: without the header the answer is
    // the container's own hostname, which no browser can resolve.
    expect(requestOrigin(request)).toBe('https://portal.example.com');
  });

  it('takes the first entry when proxies have chained', () => {
    const request = make('http://internal:3000/x', {
      'x-forwarded-host': 'portal.example.com, internal-lb',
      'x-forwarded-proto': 'https, http',
    });
    expect(requestOrigin(request)).toBe('https://portal.example.com');
  });

  it('keeps a port that the visitor used', () => {
    const request = make('http://internal:3000/x', {
      'x-forwarded-host': 'localhost:8080',
      'x-forwarded-proto': 'http',
    });
    expect(requestOrigin(request)).toBe('http://localhost:8080');
  });

  it('falls back to the request protocol when only the host is forwarded', () => {
    const request = make('http://internal:3000/x', { 'x-forwarded-host': 'portal.example.com' });
    expect(requestOrigin(request)).toBe('http://portal.example.com');
  });

  it('ignores a forwarded host that is not a host', () => {
    // Anyone can send these headers directly. A value that is not a hostname is
    // refused rather than pasted into a URL, and the fallback is the address
    // the server was actually reached on.
    for (const bad of ['evil.com/path', 'http://evil.com', 'a b', '']) {
      const request = make('http://localhost:3000/x', { 'x-forwarded-host': bad });
      expect(requestOrigin(request), `should have refused ${JSON.stringify(bad)}`).toBe(
        'http://localhost:3000',
      );
    }
  });
});
