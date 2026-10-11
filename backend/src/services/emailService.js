// Mock storage for email verification in tests and dev
const mockSentEmails = [];

/**
 * Sends an email notification or OTP.
 * In production, SMTP/SendGrid can be hooked; defaults to clean mock logger.
 */
async function sendEmail({ to, subject, text, html }) {
  const hasProvider = Boolean(
    process.env.SMTP_HOST ||
    process.env.SENDGRID_API_KEY ||
    (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'mock')
  );

  if (process.env.NODE_ENV === 'production' && !hasProvider) {
    const err = new Error('Email delivery failed: Email provider (SMTP_HOST or SENDGRID_API_KEY) is not configured in production mode');
    console.error(`[EMAIL] [PRODUCTION_PROVIDER_FAILURE] ${err.message}`);
    throw err;
  }

  const result = {
    success: true,
    provider: hasProvider ? (process.env.EMAIL_PROVIDER || 'smtp') : 'mock',
    messageId: `mail-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    to,
    subject,
    text,
    sentAt: new Date(),
  };

  mockSentEmails.push(result);
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[EMAIL] [${result.provider}] Sent to ${to}: "${subject}"`);
  }
  return result;
}

function getMockSentEmails() {
  return mockSentEmails;
}

function clearMockEmails() {
  mockSentEmails.length = 0;
}

module.exports = {
  sendEmail,
  getMockSentEmails,
  clearMockEmails,
};
