import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

/**
 * Passcode gate. Every page and API needs a valid session cookie,
 * except the login page, the login API and the health check.
 */
export async function proxy(request: NextRequest) {
  const ok = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|api/health|_next/static|_next/image|favicon.ico).*)"],
};
