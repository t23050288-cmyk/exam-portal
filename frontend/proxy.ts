import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths that require authentication
  const protectedPaths = ['/exam'];
  
  // Paths that should not be accessible if already logged in
  const authPaths = ['/login'];

  // For client-side session storage checks, we usually do this in the layout or page
  // because middleware doesn't have access to sessionStorage.
  // However, we can use a cookie if we transitioned to cookie-based auth.
  // Since we are using sessionStorage per plan, we will handle redirects in the pages/root.

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
