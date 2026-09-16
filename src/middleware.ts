import { NextResponse, type NextRequest } from "next/server";

/** Supply the trusted original route to the shared authentication layout. */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-snapsell-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/dashboard/:path*", "/parametres/:path*"] };
