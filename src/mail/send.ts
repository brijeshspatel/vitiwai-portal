import nodemailer from 'nodemailer';
import { formatFJD, type Money } from '@/domain/money';
import type { Env } from '@/config/env';

/**
 * Transactional email.
 *
 * In phase 1 this reaches Mailpit, which accepts the SMTP conversation and
 * shows the message at its web interface. Nothing leaves the machine. The SMTP
 * path itself is real; only the destination is local.
 */
export function createMailer(env: Env) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    // Mailpit accepts anything. A real server would not, and this is where
    // credentials would go.
    tls: { rejectUnauthorized: false },
  });
}

export async function sendReceipt(
  env: Env,
  to: string,
  receiptId: string,
  amountMinor: Money,
  invoiceId: string,
): Promise<void> {
  const amount = formatFJD(amountMinor);
  await createMailer(env).sendMail({
    from: 'Vitiwai Utilities <billing@vitiwai.example>',
    to,
    subject: `Receipt ${receiptId} - ${amount} received`,
    text: [
      'Thank you. We have received your payment.',
      '',
      `Amount:  ${amount}`,
      `Invoice: ${invoiceId}`,
      `Receipt: ${receiptId}`,
      '',
      'This is a demonstration system. The payment was SIMULATED and no real',
      'money moved. Vitiwai Utilities is a fictional company.',
    ].join('\n'),
  });
}
