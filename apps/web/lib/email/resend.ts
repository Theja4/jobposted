import "server-only";

/** Send a transactional email via Resend (design doc §10.5). No-op without RESEND_API_KEY. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "JobPosted <hello@jobposted.app>";
  if (!apiKey) {
    console.info("[email] no RESEND_API_KEY — skipping", { to: params.to, subject: params.subject });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    if (!res.ok) {
      console.error("[email] resend failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] resend error", err);
    return false;
  }
}
