import { NextResponse, type NextRequest } from "next/server";
// Dashboard pages need the admin cookie; the API authenticates with keys / secrets itself. The cookie is renewed on every visit.
export function middleware(req: NextRequest) {
  const c = req.cookies.get("am_admin")?.value;
  if (!c) return NextResponse.redirect(new URL("/login", req.url));
  const res = NextResponse.next();
  res.cookies.set("am_admin", c, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  return res;
}
export const config = { matcher: ["/((?!api/|login|_next/|favicon.ico).*)"] };
