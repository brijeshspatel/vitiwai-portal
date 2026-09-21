import { z } from 'zod';

/**
 * The only module permitted to read `process.env`.
 *
 * Every other module receives a parsed `Env`. A configuration error then
 * surfaces once, at start-up, naming the variable - rather than as `undefined`
 * reaching a URL builder three layers away.
 */

/**
 * Ports Windows reserves on the development machine. Binding one fails with
 * "An attempt was made to access a socket in a way forbidden by its access
 * permissions", and the port has no listener, so every "is it free" check that
 * looks for a listener reports it free.
 *
 * The range 55403-55502 was read from
 * `netsh interface ipv4 show excludedportrange protocol=tcp` on 2026-09-21.
 * These two are named because an earlier draft of the specification proposed
 * them, and a reader returning to that draft would otherwise reintroduce them.
 */
export const KNOWN_RESERVED_PORTS = new Set([55432, 55433]);

const port = (name: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v), { message: `${name} must be a whole number` })
    .transform(Number)
    .refine((v) => v >= 1 && v <= 65535, { message: `${name} must be between 1 and 65535` })
    .refine((v) => !KNOWN_RESERVED_PORTS.has(v), {
      message: `${name} is inside a reserved port range on this machine and cannot be bound`,
    });

const schema = z.object({
  ODOO_URL: z.string().url(),
  ODOO_DB: z.string().min(1),
  ODOO_USER: z.string().min(1),
  ODOO_PASSWORD: z.string().min(1),
  MEILI_URL: z.string().url(),
  MEILI_MASTER_KEY: z.string().min(1),
  GATEWAY_URL: z.string().url(),
  OCR_URL: z.string().url(),
  DOCGEN_URL: z.string().url(),
  PORTAL_DATABASE_URL: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: port('SMTP_PORT'),
  PORT_PORTAL: port('PORT_PORTAL'),
  PORT_ODOO: port('PORT_ODOO'),
  PORT_PORTAL_DB: port('PORT_PORTAL_DB'),
  PORT_ODOO_DB: port('PORT_ODOO_DB'),
  PORT_MEILI: port('PORT_MEILI'),
  PORT_GATEWAY: port('PORT_GATEWAY'),
  PORT_OCR: port('PORT_OCR'),
  PORT_DOCGEN: port('PORT_DOCGEN'),
  PORT_MAILPIT_SMTP: port('PORT_MAILPIT_SMTP'),
  PORT_MAILPIT_WEB: port('PORT_MAILPIT_WEB'),
});

export type Env = z.infer<typeof schema>;

/**
 * Every port the stack publishes. `SMTP_PORT` is deliberately absent: it points
 * the portal at Mailpit and is not a port this project binds.
 *
 * `scripts/check-ports.mjs` iterates this. A unit test asserts it matches the
 * schema's own port fields, because a port added to one and not the other is
 * a port that stops being checked without anyone noticing.
 */
export const PORT_KEYS = [
  'PORT_PORTAL',
  'PORT_ODOO',
  'PORT_PORTAL_DB',
  'PORT_ODOO_DB',
  'PORT_MEILI',
  'PORT_GATEWAY',
  'PORT_OCR',
  'PORT_DOCGEN',
  'PORT_MAILPIT_SMTP',
  'PORT_MAILPIT_WEB',
] as const satisfies readonly (keyof Env)[];

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const detail = result.error.issues
    .map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return issue.code === 'invalid_type' && issue.message === 'Required'
        ? `${key} is missing`
        : `${key}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(`the environment is not usable - ${detail}`);
}

let cached: Env | undefined;

/** Parses `process.env` once per process. */
export function loadEnv(): Env {
  cached ??= parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}
