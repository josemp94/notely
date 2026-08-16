import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOidcConfig, exchangeCode, resolveUser, appBaseUrl } from "@/server/oidc";
import { ensureWorkspace } from "@/server/provision";
import { createSession, sessionCookie, SESSION_MAX_AGE } from "@/server/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = appBaseUrl(url.origin);
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?e=oidc_off", base));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oidc_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?e=state", base));
  }

  try {
    const tokens = await exchangeCode(cfg, base, code);
    const info = await resolveUser(cfg, tokens);
    if (!info.email) return NextResponse.redirect(new URL("/login?e=noemail", base));

    let user = await db.user.findUnique({ where: { email: info.email } });
    if (!user) {
      const isFirst = (await db.user.count()) === 0;
      user = await db.user.create({
        data: { email: info.email, name: info.name, role: isFirst ? "admin" : "member" },
      });
    }
    await ensureWorkspace(db, user);

    const token = await createSession(user.id);
    const res = NextResponse.redirect(new URL("/", base));
    res.headers.append("Set-Cookie", sessionCookie(token, SESSION_MAX_AGE));
    res.headers.append("Set-Cookie", "oidc_state=; Path=/; Max-Age=0");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?e=oidc_fail", base));
  }
}
