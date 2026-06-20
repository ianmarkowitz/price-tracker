import { Resend } from "resend";

export type AlertDigestItem = {
  productName: string;
  effectivePrice: number;
  seller: string;
  link: string;
  listedPrice: number;
  shipping: number;
  rewardsValue: number;
  priorPrice: number | null;
  trailingLow: number | null;
};

export type MatchIssueItem = {
  productName: string;
  reason: string;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function renderAlertItem(item: AlertDigestItem): string {
  const breakdown =
    item.rewardsValue > 0
      ? `${fmt(item.listedPrice)} listed + ${fmt(item.shipping)} shipping − ${fmt(
          item.rewardsValue
        )} rewards = ${fmt(item.effectivePrice)}`
      : `${fmt(item.listedPrice)} listed + ${fmt(item.shipping)} shipping = ${fmt(
          item.effectivePrice
        )}`;

  const comparisons: string[] = [];
  if (item.priorPrice != null) comparisons.push(`prior reading: ${fmt(item.priorPrice)}`);
  if (item.trailingLow != null) comparisons.push(`trailing low: ${fmt(item.trailingLow)}`);

  return `
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e5e5;">
      <h3 style="margin:0 0 4px;">${item.productName}</h3>
      <p style="font-size:20px;font-weight:bold;margin:4px 0;color:#16a34a;">${fmt(
        item.effectivePrice
      )} at ${item.seller}</p>
      <p style="margin:4px 0;color:#555;">${breakdown}</p>
      <p style="margin:4px 0;color:#777;font-size:13px;">${comparisons.join(" · ")}</p>
      <a href="${item.link}" style="color:#2563eb;">View offer →</a>
    </div>
  `;
}

function renderMatchIssue(item: MatchIssueItem): string {
  return `<li><strong>${item.productName}</strong>: ${item.reason}</li>`;
}

export async function sendDigestEmail(params: {
  alerts: AlertDigestItem[];
  matchIssues: MatchIssueItem[];
}) {
  const { alerts, matchIssues } = params;
  if (alerts.length === 0 && matchIssues.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.ALERT_EMAIL_TO;
  const fromEmail = process.env.ALERT_EMAIL_FROM ?? "Price Tracker <alerts@resend.dev>";

  if (!apiKey || !toEmail) {
    console.error("Missing RESEND_API_KEY or ALERT_EMAIL_TO; skipping email send.");
    return;
  }

  const resend = new Resend(apiKey);

  let html = "";
  if (alerts.length > 0) {
    html += `<h2>Price drops (${alerts.length})</h2>${alerts.map(renderAlertItem).join("")}`;
  }
  if (matchIssues.length > 0) {
    html += `<h2>Needs attention (${matchIssues.length})</h2><ul>${matchIssues
      .map(renderMatchIssue)
      .join("")}</ul>`;
  }

  const subject =
    alerts.length > 0
      ? `Price Tracker: ${alerts.length} price drop${alerts.length > 1 ? "s" : ""}`
      : `Price Tracker: ${matchIssues.length} item(s) need attention`;

  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject,
    html,
  });
}
