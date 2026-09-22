/**
 * Is a port free? Asked properly, across both address families.
 *
 * A single bind probe on `0.0.0.0` answers the wrong question. `next start`
 * binds the IPv6 wildcard `::`, which on Windows and Linux is a dual-stack
 * socket: it serves `127.0.0.1` and `[::1]` alike, while `0.0.0.0` stays
 * bindable. So the probe reports the port free, the caller believes it, and a
 * stale server carries on serving the previous build.
 *
 * That is exactly the failure `restart-portal.mjs` exists to prevent, and it
 * reported `PASS - port 3000 is already free` while curl got 200 from the
 * server it had not stopped. Measured 2026-09-22:
 *
 *     0.0.0.0: free      <- what the old probe asked
 *     ::     : BUSY (EADDRINUSE)
 *
 * `check-ports.mjs` never had the hole, because it also connects to the port
 * and a dual-stack listener answers. Two checks that fail differently is the
 * reason it survived; this module gives both scripts the same pair.
 */

import net from 'node:net';

/** Errors that mean "this address family is not available here", not "busy". */
const NO_SUCH_FAMILY = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL', 'EPROTONOSUPPORT']);

/**
 * Bind one address and release it.
 *
 * @returns `true` free, `false` busy, `null` this family does not exist here.
 */
function bindOne(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      resolve(NO_SUCH_FAMILY.has(error.code) ? null : false);
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * True when the port can be bound on every address family this host has.
 *
 * The two binds are sequential and each is closed before the next, because a
 * dual-stack `::` socket and an `0.0.0.0` socket held at once conflict on
 * Linux and would report a free port as busy.
 */
export async function isBindable(port) {
  for (const host of ['0.0.0.0', '::']) {
    const answer = await bindOne(port, host);
    if (answer === false) return false;
  }
  return true;
}

/** Connect to one address. True when something accepts. */
function connectOne(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * True when something is already listening, asked on both loopback addresses.
 *
 * A server bound to `127.0.0.1` alone is invisible from `[::1]`, and the
 * reverse holds too, so one address is not enough to conclude "nothing there".
 */
export async function isOccupied(port) {
  for (const host of ['127.0.0.1', '::1']) {
    if (await connectOne(port, host)) return true;
  }
  return false;
}

/**
 * True when the port is free to use: nothing listening, and bindable
 * everywhere. The two checks catch different things - a listener the operating
 * system would let us steal, and a port the operating system reserves and will
 * refuse with no listener present.
 */
export async function isFree(port) {
  if (await isOccupied(port)) return false;
  return isBindable(port);
}
