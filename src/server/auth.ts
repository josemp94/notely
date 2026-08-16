import crypto from "crypto";
import { db } from "@/lib/db";

// Notely es SSO-only: no hay contraseñas. Este módulo solo maneja sesiones (cookie).

export const SESSION_COOKIE = "notely_session";
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await db.session.create({ data: { userId, token, expiresAt } });
  return token;
}

export async function getSessionUser(token: string | undefined | null) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return s.user;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { token } });
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}
