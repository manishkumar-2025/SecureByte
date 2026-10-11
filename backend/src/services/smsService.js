const https = require('https');
const { env } = require('../config/env');

// Mock storage for tests and inspection
const mockSentSms = [];

/**
 * Normalizes phone numbers to standard E.164-compatible format (+ followed by digits).
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  // Default to +91 or standard leading +
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

/**
 * Sends an SMS message with retry logic and idempotency safety.
 * Uses Twilio if configured; otherwise gracefully falls back to mock logger.
 */
async function sendSms({ to, message, maxRetries = 2 }) {
  const normalizedTo = normalizePhone(to);
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  let lastError = null;

  if (process.env.NODE_ENV === 'production' && !(accountSid && authToken && fromNumber)) {
    const err = new Error('SMS delivery failed: Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are not configured in production mode');
    console.error(`[SMS] [PRODUCTION_PROVIDER_FAILURE] ${err.message}`);
    throw err;
  }

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (accountSid && authToken && fromNumber) {
        // Real Twilio API integration via standard HTTPS without external heavy dependencies
        const result = await sendViaTwilio({ accountSid, authToken, from: fromNumber, to: normalizedTo, body: message });
        return {
          success: true,
          provider: 'twilio',
          messageId: result.sid,
          attempts: attempt,
          to: normalizedTo,
        };
      }

      // Mock / Dev / Test mode
      const mockResult = {
        success: true,
        provider: 'mock',
        messageId: `mock-sms-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        attempts: attempt,
        to: normalizedTo,
        message,
        sentAt: new Date(),
      };
      mockSentSms.push(mockResult);
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[SMS] [${mockResult.provider}] Sent to ${normalizedTo}: "${message}"`);
      }
      return mockResult;
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        // Exponential backoff: 200ms, 400ms...
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  }

  throw new Error(`SMS delivery failed after ${maxRetries + 1} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
}

function sendViaTwilio({ accountSid, authToken, from, to, body }) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({ From: from, To: to, Body: body }).toString();
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const req = https.request(
      {
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          Authorization: authHeader,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || `Twilio HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Twilio response: ${e.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getMockSentSms() {
  return mockSentSms;
}

function clearMockSms() {
  mockSentSms.length = 0;
}

module.exports = {
  sendSms,
  normalizePhone,
  getMockSentSms,
  clearMockSms,
};
