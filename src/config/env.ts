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
  /**
   * Is this build a public demonstration?
   *
   * It selects two things at once, and deliberately not as two flags: a
   * composition whose adapters reach no external service, and an onboarding
   * form that accepts no identity document. They are one decision - *this build
   * faces the public* - and two flags would permit the combination nobody
   * wants, a public build that still asks a stranger for a passport.
   *
   * Only the exact string `true` enables it. `z.coerce.boolean()` would read
   * the string "false" as true, which is the wrong way round for a flag whose
   * off state is the safe one.
   */
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
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

/**
 * What a demonstration build uses for the services it does not have.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so these are not
 * placeholders that might accidentally reach something - they are addresses
 * guaranteed to fail. A demonstration adapter never dials them; if a future
 * change dials one anyway, it fails immediately and visibly rather than
 * finding whatever happens to be listening.
 *
 * The ports are equally unused: a container binds one port, given by the host.
 */
const DEMO_PLACEHOLDERS: Record<string, string> = {
  ODOO_URL: 'http://odoo.invalid',
  ODOO_DB: 'unused-in-demonstration',
  ODOO_USER: 'unused-in-demonstration',
  ODOO_PASSWORD: 'unused-in-demonstration',
  MEILI_URL: 'http://meilisearch.invalid',
  MEILI_MASTER_KEY: 'unused-in-demonstration',
  GATEWAY_URL: 'http://gateway.invalid',
  OCR_URL: 'http://ocr.invalid',
  DOCGEN_URL: 'http://docgen.invalid',
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '25',
  PORT_PORTAL: '3000',
  PORT_ODOO: '8069',
  PORT_PORTAL_DB: '15432',
  PORT_ODOO_DB: '15433',
  PORT_MEILI: '7700',
  PORT_GATEWAY: '8091',
  PORT_OCR: '8090',
  PORT_DOCGEN: '8092',
  PORT_MAILPIT_SMTP: '1025',
  PORT_MAILPIT_WEB: '8025',
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  // A demonstration host supplies a database URL and a port and nothing else.
  // Requiring it to invent an Odoo address for a build that never calls Odoo
  // would make the flag harder to use than the thing it replaces.
  if (source.DEMO_MODE === 'true') {
    source = { ...DEMO_PLACEHOLDERS, ...stripEmpty(source) };
  }

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

/**
 * Drops keys whose value is absent or empty.
 *
 * A host that declares a variable and leaves it blank would otherwise override
 * a placeholder with an empty string, and the schema would reject it - which
 * reads as "you must set ODOO_URL" on a build that has no Odoo.
 */
function stripEmpty(source: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
}

let cached: Env | undefined;

/** Parses `process.env` once per process. */
export function loadEnv(): Env {
  cached ??= parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}
