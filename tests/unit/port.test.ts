import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { isBindable, isFree, isOccupied } from '../../scripts/lib/port.mjs';

// The defect these cover, measured on 2026-09-22: `npm run portal:free`
// reported "PASS - port 3000 is already free" while `curl localhost:3000`
// returned 200. `next start` had bound the IPv6 wildcard `::`, which is a
// dual-stack socket serving 127.0.0.1 too, and the probe asked only whether
// `0.0.0.0` was bindable - which it was.

const servers: net.Server[] = [];

/** Listen on one address, or return null where the family does not exist. */
async function listen(host: string): Promise<number | null> {
  const server = net.createServer((socket) => socket.end());
  const started = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen({ port: 0, host }, () => resolve(true));
  });
  if (!started) return null;
  servers.push(server);
  return (server.address() as net.AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('asking whether a port is free', () => {
  it('finds a port nobody is using', async () => {
    // The control. Without it, a probe hard-wired to "busy" would pass every
    // other case here and be useless.
    const probe = await listen('0.0.0.0');
    expect(probe).not.toBeNull();
    await new Promise((r) => servers.pop()!.close(r));
    expect(await isFree(probe!)).toBe(true);
    expect(await isBindable(probe!)).toBe(true);
    expect(await isOccupied(probe!)).toBe(false);
  });

  it('sees a server on the IPv6 wildcard, which the old probe did not', async () => {
    const port = await listen('::');
    if (port === null) return; // no IPv6 on this host; the next case still covers IPv4
    expect(await isBindable(port)).toBe(false);
    expect(await isFree(port)).toBe(false);
  });

  it('sees a server on the IPv4 wildcard', async () => {
    const port = await listen('0.0.0.0');
    expect(port).not.toBeNull();
    expect(await isBindable(port!)).toBe(false);
    expect(await isFree(port!)).toBe(false);
  });

  it('sees a server bound only to IPv6 loopback', async () => {
    // Nothing is on 127.0.0.1, so an occupancy check that asks one address
    // concludes the port is free.
    const port = await listen('::1');
    if (port === null) return;
    expect(await isOccupied(port!)).toBe(true);
  });

  it('sees a server bound only to IPv4 loopback', async () => {
    const port = await listen('127.0.0.1');
    expect(port).not.toBeNull();
    expect(await isOccupied(port!)).toBe(true);
  });
});
