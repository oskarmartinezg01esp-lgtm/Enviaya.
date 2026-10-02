import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("oauth_state")?.value;
  const fail = (e: string) => NextResponse.redirect(new URL(`/login?error=${e}`, req.url));
  if (!code || !state || state !== expected) return fail("oauth_state");
  try {
    const redirectUri = new URL("/api/auth/google/callback", process.env.APP_URL ?? req.url).toString();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("oauth_token");
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
    const info = (await infoRes.json()) as { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
    if (!info.email_verified) return fail("email_unverified");
    const email = info.email.toLowerCase();
    let user = await db.user.findFirst({ where: { OR: [{ googleId: info.sub }, { email }] } });
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          googleId: info.sub,
          name: info.name ?? email.split("@")[0],
          profile: { create: { avatarUrl: info.picture } },
          paymentMethods: { create: [{ type: "CASH", provider: "cash", isDefault: true }] },
        },
      });
    } else if (!user.googleId) {
      user = await db.user.update({ where: { id: user.id }, data: { googleId: info.sub } });
    }
    await createSession(user.id);
    await audit({ userId: user.id, action: "auth.google", entity: "User", entityId: user.id });
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete("oauth_state");
    return res;
  } catch {
    return fail("oauth");
  }
}
