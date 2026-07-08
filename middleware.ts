/**
 * middleware.ts (root project, BUKAN di /app)
 *
 * Berjalan di Edge Runtime -- TIDAK boleh import Prisma atau modul Node.js.
 * Tugasnya: "default deny" -- tolak request ke route yang dilindungi kalau
 * tidak ada token atau token tidak valid secara kriptografis.
 *
 * Hal yang TIDAK dilakukan di sini (dilakukan di route handler via lib/auth.ts):
 * - Cek admin scope per-node (admin cabang vs admin global) -- butuh Prisma
 * - Cek apakah user masih ada di DB / belum di-nonaktifkan -- butuh Prisma
 * Kalau semua itu dimasukkan ke sini, Edge Runtime akan crash.
 *
 * CATATAN (komentar lama di sini KELIRU): cek role admin vs member TIDAK
 * butuh Prisma -- role sudah ada di dalam JWT payload (`payload.role`),
 * didekode di sini tanpa query apapun. requireAdmin() di lib/auth.ts juga
 * cuma percaya session.role dari token yang sama, tidak query ulang ke DB.
 * Makanya guard ADMIN_ONLY_PAGES di bawah aman dilakukan di sini.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Route yang TIDAK perlu login -- semua lainnya otomatis dilindungi
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/setup-password',
  '/api/auth/reset-password',
  '/login',
  '/register',
  '/setup-password',
  '/reset-password',
  '/',
];

// Halaman yang butuh role admin, BUKAN cuma login. SENGAJA cuma halaman
// (/admin, /admin/claims), BUKAN prefix /api/admin/* -- endpoint di bawah
// /api/admin/ itu CAMPURAN: sebagian memang admin-only (pakai requireAdmin()
// sendiri di route handler-nya), sebagian sengaja boleh diakses semua member
// login (misal /api/admin/persons dipakai combobox di halaman kalkulator
// panggilan & pencarian register -- BUKAN cuma admin). Kalau prefix ini
// di-block blanket di sini, fitur yang sengaja shared itu ikut rusak.
const ADMIN_ONLY_PAGES = ['/admin'];

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

  // Guard tambahan: halaman admin-only butuh role admin, bukan cuma login.
  // Ini SEBELUMNYA tidak ada -- member yang login bisa buka /admin langsung
  // dan cuma dapat halaman kosong/gagal fetch (API-nya nolak 403, tapi
  // halamannya sendiri tidak kasih pesan jelas). Sekarang ditolak di sini,
  // sebelum halaman sempat di-render sama sekali.
  const isAdminPage = ADMIN_ONLY_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (isAdminPage && payload.role !== 'admin') {
    const treeUrl = new URL('/tree', req.url);
    treeUrl.searchParams.set('denied', 'admin-only');
    return NextResponse.redirect(treeUrl);
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