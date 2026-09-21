import { describe, expect, it } from 'vitest';
import { parseEnv, PORT_KEYS } from '@/config/env';

const valid = {
  ODOO_URL: 'http://localhost:8069',
  ODOO_DB: 'vitiwai',
  ODOO_USER: 'admin',
  ODOO_PASSWORD: 'admin',
  MEILI_URL: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'a-local-development-key',
  GATEWAY_URL: 'http://localhost:8091',
  PORTAL_DATABASE_URL: 'postgres://portal:portal@localhost:15432/portal',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  PORT_PORTAL: '3000',
  PORT_ODOO: '8069',
  PORT_PORTAL_DB: '15432',
  PORT_ODOO_DB: '15433',
  PORT_MEILI: '7700',
  PORT_GATEWAY: '8091',
  PORT_MAILPIT_SMTP: '1025',
  PORT_MAILPIT_WEB: '8025',
};

describe('environment parsing', () => {
  it('accepts a complete environment and coerces ports to numbers', () => {
    const env = parseEnv(valid);
    expect(env.PORT_PORTAL).toBe(3000);
    expect(env.PORT_PORTAL_DB).toBe(15432);
    expect(env.ODOO_DB).toBe('vitiwai');
  });

  it('names the missing variable rather than failing vaguely', () => {
    const { ODOO_URL: _removed, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrow(/ODOO_URL/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => parseEnv({ ...valid, PORT_MEILI: '70000' })).toThrow(/PORT_MEILI/);
    expect(() => parseEnv({ ...valid, PORT_MEILI: '0' })).toThrow(/PORT_MEILI/);
  });

  it('rejects a port that is not a number', () => {
    expect(() => parseEnv({ ...valid, PORT_ODOO: 'eight-thousand' })).toThrow(/PORT_ODOO/);
  });

  it('refuses the Windows reserved ports the specification bans', () => {
    // 55432 and 55433 sit inside the reserved range 55403-55502 on the target
    // machine. They are banned by name so nobody reintroduces them from an
    // older document.
    expect(() => parseEnv({ ...valid, PORT_PORTAL_DB: '55432' })).toThrow(/reserved/i);
    expect(() => parseEnv({ ...valid, PORT_ODOO_DB: '55433' })).toThrow(/reserved/i);
  });

  it('exposes every port key so the preflight cannot miss one', () => {
    // If a port is added to the schema and not to PORT_KEYS, the preflight
    // silently stops checking it. This test is what stops that.
    const schemaPortKeys = Object.keys(valid).filter((k) => k.startsWith('PORT_'));
    expect([...PORT_KEYS].sort()).toEqual(schemaPortKeys.sort());
  });
});
