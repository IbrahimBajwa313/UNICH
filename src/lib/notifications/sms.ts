import { normalizePhone } from "./phone";

export type SendSmsInput = {
  to: string;
  text: string;
};

export type SendSmsResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function smsConfigured(): boolean {
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (provider !== "twilio") return false;
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (!provider) {
    return {
      ok: false,
      error:
        "SMS is not configured — set SMS_PROVIDER=twilio with TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM",
    };
  }
  if (provider !== "twilio") {
    return { ok: false, error: `Unsupported SMS_PROVIDER: ${provider}` };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken) {
    return {
      ok: false,
      error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not configured",
    };
  }
  if (!from && !messagingServiceSid) {
    return {
      ok: false,
      error: "Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID",
    };
  }

  const to = normalizePhone(input.to || "");
  if (!to) {
    return { ok: false, error: "SMS recipient phone is required" };
  }
  if (!input.text?.trim()) {
    return { ok: false, error: "SMS body is required" };
  }

  const params = new URLSearchParams({ To: `+${to}`, Body: input.text });
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else if (from) params.set("From", from);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.message || `Twilio rejected the message (${res.status})`,
      };
    }
    return { ok: true, id: data.sid || "sent" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send SMS",
    };
  }
}
