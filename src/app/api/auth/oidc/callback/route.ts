import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOidcConfig, exchangeCode, resolveUser } from "@/server/oidc";
import { ensureWorkspace } from "@/server/provision";
import { createSession, sessionCookie, SESSION_MAX_AGE } from "@/server/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?e=oidc_off", url.origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oidc_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?e=state", url.origin));
  }

  try {
    const origin = url.origin;
    const tokens = await exchangeCode(cfg, origin, code);
    const info = await resolveUser(cfg, tokens);
    if (!info.email) return NextResponse.redirect(new URL("/login?e=noemail", url.origin));

    let user = await db.user.findUnique({ where: { email: info.email } });
    if (!user) {
      user = await db.user.create({ data: { email: info.email, name: info.name, role: "member" } });
    }
    await ensureWorkspace(db, user);

    const token = await createSession(user.id);
    const res = NextResponse.redirect(new URL("/", origin));
    res.headers.append("Set-Cookie", sessionCookie(token, SESSION_MAX_AGE));
    res.headers.append("Set-Cookie", "oidc_state=; Path=/; Max-Age=0");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oidc_fail", url.origin));
  }
}
