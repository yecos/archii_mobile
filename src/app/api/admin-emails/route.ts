import { NextResponse } from "next/server";

/**
 * GET /api/admin-emails
 *
 * Returns the list of Super Admin emails from the ADMIN_EMAILS env var.
 * Used by the client to gate Super Admin UI without hardcoding emails.
 * This is a public endpoint (no auth required) since admin emails are not
 * secret — they only control which users see the Super Admin panel.
 * The actual admin actions are still protected by requireAdmin() server-side.
 */
export async function GET() {
  const adminEmails: string[] = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
    : [];

  return NextResponse.json({ adminEmails });
}
