import twilio from "twilio";

/**
 * Sends a text message via Twilio. Throws if Twilio env vars aren't set or
 * the send fails — callers should catch and log rather than let a bad
 * number silently swallow the whole cron run.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio isn't configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.");
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to, from: fromNumber, body });
}

/** Parses the comma-separated ALERT_PHONE_NUMBERS env var into a clean list. */
export function getAlertRecipients(): string[] {
  return (process.env.ALERT_PHONE_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}
