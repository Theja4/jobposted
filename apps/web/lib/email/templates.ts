/** Transactional email templates (design doc §10.5). Short, useful, on-brand. */

export interface EmailContent {
  subject: string;
  html: string;
}

function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;background:#039855;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px;margin-top:8px">${cta.label}</a>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0c1410">
    <div style="font-weight:800;font-size:18px;margin-bottom:24px">✓ JobPosted</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 12px">${heading}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3f493f">${body}</div>
    ${button}
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0" />
    <p style="font-size:12px;color:#888">You're receiving this because you signed up for JobPosted.</p>
  </div>`;
}

export function welcomeEmail(firstName?: string | null): EmailContent {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  return {
    subject: "Welcome to JobPosted 👋",
    html: layout(
      "Apply to the right jobs while you sleep",
      `<p>${hi}</p><p>You're in. Build your profile once, and we'll surface roles that match you and tailor your resume to each one. You review and confirm every submission — we never spray.</p><p>Your first 5 applications are free.</p>`,
      { label: "Find your first matches", url: "https://jobposted.app/dashboard" },
    ),
  };
}

export function submissionEmail(params: { title: string; company: string }): EmailContent {
  return {
    subject: `Applied: ${params.title} at ${params.company}`,
    html: layout(
      "Application submitted ✅",
      `<p>We just submitted your tailored application for <strong>${params.title}</strong> at <strong>${params.company}</strong>.</p><p>Track its status any time from your applications.</p>`,
      { label: "View applications", url: "https://jobposted.app/dashboard/queue" },
    ),
  };
}

export function dailyDigestEmail(params: { count: number; firstName?: string | null }): EmailContent {
  const hi = params.firstName ? `Hi ${params.firstName},` : "Hi there,";
  return {
    subject: `Today on JobPosted: ${params.count} application${params.count === 1 ? "" : "s"}`,
    html: layout(
      `${params.count} application${params.count === 1 ? "" : "s"} today`,
      `<p>${hi}</p><p>We applied to <strong>${params.count}</strong> matching role${params.count === 1 ? "" : "s"} for you today, each with a tailored resume you confirmed.</p>`,
      { label: "Open your dashboard", url: "https://jobposted.app/dashboard" },
    ),
  };
}
