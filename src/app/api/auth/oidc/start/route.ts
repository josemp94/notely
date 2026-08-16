import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOidcConfig, buildAuthUrl, appBaseUrl } from "@/server/oidc";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = appBaseUrl(url.origin);
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?e=oidc_off", base));
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = await buildAuthUrl(cfg, base, state);
    const res = NextResponse.redirect(authUrl);
    res.headers.append("Set-Cookie", `oidc_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oidc_fail", base));
  }
}
