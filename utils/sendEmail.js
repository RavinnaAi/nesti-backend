import nodemailer from 'nodemailer';
import logger from './logger.js';

function env(name, fallbackName = '') {
  return String(process.env[name] || (fallbackName ? process.env[fallbackName] : '') || '').trim();
}

function smtpConfig() {
  const host = env('EMAIL_HOST', 'SMTP_HOST');
  const port = Number(env('EMAIL_PORT', 'SMTP_PORT') || 587);
  const user = env('EMAIL_USER', 'SMTP_USER');
  const pass = env('EMAIL_PASS', 'SMTP_PASS');
  const fromAddress = env('EMAIL_FROM', 'SMTP_FROM') || user;
  const fromName = env('EMAIL_FROM_NAME', 'SMTP_FROM_NAME') || 'Nesti AI';
  const from = fromName ? { name: fromName, address: fromAddress } : fromAddress;
  const secureEnv = env('EMAIL_SECURE', 'SMTP_SECURE').toLowerCase();
  const secure = secureEnv
    ? ['1', 'true', 'yes', 'on'].includes(secureEnv)
    : port === 465;

  return { host, port, user, pass, from, fromAddress, fromName, secure };
}

export function createEmailTransport() {
  const { host, port, user, pass, secure } = smtpConfig();
  if (!host || !user || !pass) {
    throw new Error('Missing SMTP config: EMAIL_HOST, EMAIL_USER, or EMAIL_PASS');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function verifyEmailTransport() {
  const transport = createEmailTransport();
  await transport.verify();
  const { host, port, user, fromAddress, fromName, secure } = smtpConfig();
  return { host, port, user, from: fromAddress, fromName, secure };
}

const sendEmail = async (options) => {
  try {
    if (options.templateAlias || options.templateId) {
      throw new Error('Template email sending is not supported by the SMTP transport');
    }

    const transport = createEmailTransport();
    const { from } = smtpConfig();

    const response = await transport.sendMail({
      from,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.htmlMessage || `<p>${options.message}</p>`,
    });
    logger.info(`Message sent via SMTP: ${response.messageId}`);

    return { success: true, messageId: response.messageId };
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    return { success: false, error };
  }
};

export default sendEmail;