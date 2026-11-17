import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];
const COOKIE = "dayora_token";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasToken = Boolean(req.cookies.get(COOKIE)?.value);
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (!hasToken && !isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (hasToken && (isAuthPage || pathname === "/")) {
    // reset-password stays reachable even when signed in
    if (pathname.startsWith("/reset-password")) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|uploads|_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
