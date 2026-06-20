import { NextRequest, NextResponse } from "next/server";
import { checkAllProducts } from "@/lib/check-prices";
import { sendDigestEmail } from "@/lib/email";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { alertItems, matchIssueItems } = await checkAllProducts();
  await sendDigestEmail({ alerts: alertItems, matchIssues: matchIssueItems });

  return NextResponse.json({
    alertsSent: alertItems.length,
    matchIssues: matchIssueItems.length,
  });
}
