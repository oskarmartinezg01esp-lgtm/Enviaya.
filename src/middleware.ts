import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/registro", "/offline", "/manifest.webmanifest", "/sw.js"];

/**
 * Filtro rápido en el edge: sin cookie de sesión -> /login.
 * La validación real de la sesión (y del rol admin) se hace en el servidor.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("cortana_session")) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|brand|icon.svg|apple-icon.png|favicon.ico).*)"],
};
