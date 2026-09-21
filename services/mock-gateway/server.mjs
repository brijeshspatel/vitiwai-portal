/**
 * A SIMULATED payment gateway.
 *
 * It authorises nothing, settles nothing and touches no real money. It exists
 * so the portal's checkout is written against an intent-and-confirm API shaped
 * like a real provider's, which is what makes swapping in a real test account
 * a configuration change rather than a rewrite.
 *
 * Every response carries "simulated": true. That field is not decoration: it is
 * how a reader of a captured response knows what they are looking at.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8091);

/** Test instruments. A real provider publishes an equivalent table. */
const INSTRUMENTS = {
  pm_test_ok: { outcome: 'succeeded' },
  pm_test_decline: { outcome: 'declined', reason: 'card_declined' },
  pm_test_insufficient: { outcome: 'declined', reason: 'insufficient_funds' },
};

const intents = new Map();

const send = (res, status, body) => {
  const payload = JSON.stringify({ ...body, simulated: true });
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/v1/intents') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, 400, { error: 'invalid_request', message: error.message });
    }
    const amountMinor = body.amountMinor;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      return send(res, 400, {
        error: 'invalid_request',
        message: 'amountMinor must be a positive integer number of cents',
      });
    }
    if (typeof body.reference !== 'string' || body.reference.length === 0) {
      return send(res, 400, { error: 'invalid_request', message: 'reference is required' });
    }
    const intent = {
      id: `pi_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      amountMinor,
      currency: 'FJD',
      reference: body.reference,
      status: 'requires_confirmation',
      createdAt: new Date().toISOString(),
    };
    intents.set(intent.id, intent);
    return send(res, 201, { intent });
  }

  const confirm = /^\/v1\/intents\/([^/]+)\/confirm$/.exec(url.pathname);
  if (req.method === 'POST' && confirm) {
    const intent = intents.get(confirm[1]);
    if (!intent) return send(res, 404, { error: 'not_found', message: 'no such intent' });
    if (intent.status !== 'requires_confirmation') {
      return send(res, 409, {
        error: 'already_resolved',
        message: `intent is ${intent.status}`,
        intent,
      });
    }
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, 400, { error: 'invalid_request', message: error.message });
    }
    const instrument = INSTRUMENTS[body.instrument];
    if (!instrument) {
      return send(res, 400, {
        error: 'unknown_instrument',
        message: `instrument must be one of: ${Object.keys(INSTRUMENTS).join(', ')}`,
      });
    }
    if (instrument.outcome === 'declined') {
      intent.status = 'declined';
      intent.declineReason = instrument.reason;
      return send(res, 402, { error: 'payment_declined', reason: instrument.reason, intent });
    }
    intent.status = 'succeeded';
    intent.receipt = {
      id: `rc_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      paidAtMinor: intent.amountMinor,
      paidAt: new Date().toISOString(),
    };
    return send(res, 200, { intent });
  }

  if (req.method === 'GET' && confirm === null && url.pathname.startsWith('/v1/intents/')) {
    const intent = intents.get(url.pathname.slice('/v1/intents/'.length));
    if (!intent) return send(res, 404, { error: 'not_found', message: 'no such intent' });
    return send(res, 200, { intent });
  }

  send(res, 404, { error: 'not_found', message: `no route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-gateway] SIMULATED gateway listening on ${PORT}`);
});
