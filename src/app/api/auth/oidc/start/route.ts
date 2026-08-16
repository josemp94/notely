import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOidcConfig, buildAuthUrl } from "@/server/oidc";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?e=oidc_off", url.origin));
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = await buildAuthUrl(cfg, url.origin, state);
    const res = NextResponse.redirect(authUrl);
    res.headers.append("Set-Cookie", `oidc_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oidc_fail", url.origin));
  }
}
