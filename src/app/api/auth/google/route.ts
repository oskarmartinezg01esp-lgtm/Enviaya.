import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/** Inicio de OAuth con Google (opcional: requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET). */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=google_disabled", req.url));
  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/google/callback", process.env.APP_URL ?? req.url).toString();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
