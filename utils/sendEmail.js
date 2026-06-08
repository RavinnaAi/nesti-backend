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

function createTransportFromConfig(config) {
  const { host, port, user, pass, secure } = config;
  if (!host || !user || !pass) {
    throw new Error('Missing SMTP config: EMAIL_HOST, EMAIL_USER, or EMAIL_PASS');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    family: 4,
    tls: { servername: host },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export function createEmailTransport() {
  return createTransportFromConfig(smtpConfig());
}

function fallbackConfigIfNeeded(config, error) {
  const host = String(config?.host || '').trim().toLowerCase();
  if (host !== 'smtp.resend.com') return null;
  if (Number(config?.port) !== 465 || !config?.secure) return null;
  const msg = String(error?.message || '').toLowerCase();
  if (!msg.includes('timeout') && !msg.includes('enetunreach') && !msg.includes('econnrefused')) return null;
  return { ...config, port: 587, secure: false };
}

export async function verifyEmailTransport() {
  const config = smtpConfig();
  let activeConfig = config;
  let transport = createTransportFromConfig(activeConfig);
  try {
    await transport.verify();
  } catch (error) {
    const fallback = fallbackConfigIfNeeded(config, error);
    if (!fallback) throw error;
    logger.warn(`Primary SMTP verify failed (${error.message}); retrying with ${fallback.host}:${fallback.port}`);
    activeConfig = fallback;
    transport = createTransportFromConfig(activeConfig);
    await transport.verify();
  }
  const { host, port, user, fromAddress, fromName, secure } = activeConfig;
  return { host, port, user, from: fromAddress, fromName, secure };
}

const sendEmail = async (options) => {
  try {
    if (options.templateAlias || options.templateId) {
      throw new Error('Template email sending is not supported by the SMTP transport');
    }

    const config = smtpConfig();
    const sendArgs = {
      from: config.from,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.htmlMessage || `<p>${options.message}</p>`,
    };

    let response;
    try {
      response = await createTransportFromConfig(config).sendMail(sendArgs);
    } catch (error) {
      const fallback = fallbackConfigIfNeeded(config, error);
      if (!fallback) throw error;
      logger.warn(`Primary SMTP send failed (${error.message}); retrying with ${fallback.host}:${fallback.port}`);
      response = await createTransportFromConfig(fallback).sendMail(sendArgs);
    }
    logger.info(`Message sent via SMTP: ${response.messageId}`);

    return { success: true, messageId: response.messageId };
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    return { success: false, error };
  }
};

export default sendEmail;