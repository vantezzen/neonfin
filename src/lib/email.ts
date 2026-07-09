import "server-only";
import { env } from "@/lib/env";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let warnedMissingEmailConfig = false;

export function appUrl(path: string): string {
  return new URL(path, env().NEXT_PUBLIC_APP_URL).toString();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buttonEmailHtml({
  title,
  intro,
  buttonLabel,
  buttonUrl,
  outro,
}: {
  title: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  outro?: string;
}): string {
  const safeUrl = escapeHtml(buttonUrl);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
      <p style="margin:0 0 20px">${escapeHtml(intro)}</p>
      <p style="margin:0 0 20px">
        <a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#111827;color:#ffffff;padding:10px 14px;text-decoration:none">
          ${escapeHtml(buttonLabel)}
        </a>
      </p>
      <p style="margin:0 0 16px;color:#4b5563;font-size:14px">Or open this link: <a href="${safeUrl}">${safeUrl}</a></p>
      ${outro ? `<p style="margin:0;color:#4b5563;font-size:14px">${escapeHtml(outro)}</p>` : ""}
    </div>
  `;
}

export async function sendEmail({ to, subject, text, html }: EmailInput): Promise<void> {
  const config = env();
  if (!config.RESEND_API_KEY || !config.RESEND_FROM) {
    if (!warnedMissingEmailConfig) {
      warnedMissingEmailConfig = true;
      console.warn(
        "[vantezzen/pay] Email not sent. Set RESEND_API_KEY and RESEND_FROM to enable auth and wallet recovery emails.",
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[vantezzen/pay email]\nTo: ${to}\nSubject: ${subject}\n\n${text}`,
      );
    }
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.RESEND_FROM,
      to,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Resend email failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`,
    );
  }
}
