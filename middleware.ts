/**
 * middleware.ts (root project, BUKAN di /app)
 *
 * Berjalan di Edge Runtime -- TIDAK boleh import Prisma atau modul Node.js.
 * Tugasnya: "default deny" -- tolak request ke route yang dilindungi kalau
 * tidak ada token atau token tidak valid secara kriptografis.
 *
 * Hal yang TIDAK dilakukan di sini (dilakukan di route handler via lib/auth.ts):
 * - Cek role (admin vs member) -- butuh Prisma
 * - Cek admin scope per-node -- butuh Prisma
 * - Cek apakah user masih ada di DB -- butuh Prisma
 * Kalau semua itu dimasukkan ke sini, Edge Runtime akan crash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Route yang TIDAK perlu login -- semua lainnya otomatis dilindungi
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout', // logout boleh dipanggil meski token sudah expired
  '/login',
  '/',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Biarkan public paths lewat tanpa cek
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Biarkan static assets lewat (_next/static, _next/image, favicon, dll)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return redirectOrUnauthorized(req);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    // Token ada tapi tidak valid (expired, tampered) -- hapus cookie
    const res = redirectOrUnauthorized(req);
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Token valid -- teruskan request, sisipkan user info ke header
  // supaya route handler bisa baca tanpa perlu verifikasi ulang
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', payload.sub);
  requestHeaders.set('x-user-role', payload.role);
  if (payload.personId) requestHeaders.set('x-user-person-id', payload.personId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectOrUnauthorized(req: NextRequest): NextResponse {
  // Request ke API route: kembalikan 401 JSON (bukan redirect HTML)
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Belum login atau sesi habis.' },
      { status: 401 }
    );
  }
  // Request ke halaman: redirect ke /login dengan return URL
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('redirect', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Matcher: semua path KECUALI _next internal dan static files.
  // PUBLIC_PATHS di atas menangani pengecualian lebih spesifik.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};