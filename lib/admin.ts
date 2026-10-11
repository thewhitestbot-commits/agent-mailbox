// The dashboard's sign-in: one ADMIN_PASSWORD, a signed cookie that lasts 400 days and renews itself.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hmac, safeEqual } from "./util";

export const COOKIE = "am_admin";
const token = () => hmac(process.env.ADMIN_PASSWORD || "", "agent-mailbox-admin");
export function isAdmin() {
  if (!process.env.ADMIN_PASSWORD) return false;
  const c = cookies().get(COOKIE)?.value || "";
  return safeEqual(c, token());
}
/** Every dashboard page calls this first (a check in a shared layout does not stop a page from rendering). */
export function needAdmin() { if (!isAdmin()) redirect("/login"); }
export function checkPassword(pw: string) { const want = process.env.ADMIN_PASSWORD || ""; return !!want && safeEqual(pw, want); }
export function signIn() { cookies().set(COOKIE, token(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400 }); }
