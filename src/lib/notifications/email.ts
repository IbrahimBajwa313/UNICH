import { Resend } from "resend";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

let resendClient: Resend | null = null;

function getResend(apiKey: string): Resend {
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();

  if (provider !== "resend") {
    return { ok: false, error: `Unsupported EMAIL_PROVIDER: ${provider}` };
  }
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }
  if (!input.to?.trim()) {
    return { ok: false, error: "Recipient email is required" };
  }

  try {
    const { data, error } = await getResend(apiKey).emails.send({
      from,
      to: input.to.trim(),
      subject: input.subject,
      text: input.text,
      html:
        input.html ||
        `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(input.text)}</pre>`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id || "sent" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
