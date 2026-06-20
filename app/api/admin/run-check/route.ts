import { NextResponse } from "next/server";
import { checkAllProducts } from "@/lib/check-prices";
import { sendDigestEmail } from "@/lib/email";

// Manually trigger a check run (and email send) outside the cron schedule,
// useful for testing the alert path end-to-end.
export async function POST() {
  const { alertItems, matchIssueItems } = await checkAllProducts();
  await sendDigestEmail({ alerts: alertItems, matchIssues: matchIssueItems });
  return NextResponse.json({ alertItems, matchIssueItems });
}
