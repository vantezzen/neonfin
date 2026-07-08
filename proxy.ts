import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
const { rewrite: rewriteLLM } = rewritePath(
  "/docs{/*path}",
  "/llms.mdx/docs{/*path}",
);

/**
 * Optimistic redirect only - checks for the presence of a session cookie
 * (no DB/crypto). The real verification lives in the DAL (`requireUser`), per
 * the Next.js guidance that Proxy must not do full session management.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (!hasSession && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname.startsWith("/docs") && isMarkdownPreferred(request)) {
    const result = rewriteLLM(request.nextUrl.pathname);
    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
