/**
 * lib/auth.ts
 *
 * Dua lapisan auth:
 * 1. Token operations (signToken, verifyToken) — dipakai JUGA di middleware.ts
 *    (Edge Runtime). Fungsi ini TIDAK boleh import Prisma.
 * 2. Session helpers (getSession, requireAuth, requireAdmin) — Node.js only,
 *    dipakai di API route handlers untuk validasi role & scope.
 *
 * Token payload yang disimpan di JWT:
 * - sub: user.id (UUID)
 * - role: 'admin' | 'member'
 * - personId: string | null (null kalau klaim belum disetujui -- seharusnya
 *   tidak bisa login kalau belum ada personId, tapi disimpan di token supaya
 *   tidak perlu DB round-trip di setiap request)
 *
 * CATATAN: token tidak menyimpan admin_scope -- scope dicek langsung ke DB
 * setiap kali dibutuhkan (via requireAdminFor). Kalau scope disimpan di token,
 * perubahan scope oleh super admin tidak akan efektif sampai token expire.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const COOKIE_NAME = 'ft_session';
const JWT_ALGORITHM = 'HS256';
const TOKEN_EXPIRY = '7d';

// ============================================================
// JWT secret -- wajib diset di .env sebelum deploy.
// Kalau tidak ada, crash saat startup (bukan saat request) supaya
// tidak ada kondisi "jalan tapi tidak aman".
// ============================================================
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET tidak ada atau terlalu pendek (min 32 karakter). ' +
        'Set di file .env sebelum menjalankan aplikasi.'
    );
  }
  return new TextEncoder().encode(secret);
}

// ============================================================
// Tipe payload -- eksplisit supaya tidak ada typo saat baca di route handler
// ============================================================
export type SessionPayload = {
  sub: string;         // user.id
  role: 'admin' | 'member';
  personId: string | null;
};

// ============================================================
// LAPISAN 1: operasi token -- aman di Edge Runtime (tidak import Prisma)
// ============================================================

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    // Validasi minimal -- kalau field wajib tidak ada, token dianggap invalid
    if (
      typeof payload.sub !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'member')
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role as 'admin' | 'member',
      personId: typeof payload.personId === 'string' ? payload.personId : null,
    };
  } catch {
    // Token expired, signature invalid, dll
    return null;
  }
}

// ============================================================
// LAPISAN 2: session helpers -- Node.js only, boleh akses Prisma
// ============================================================

/**
 * Baca session dari cookie di API route handler.
 * Return null kalau tidak ada cookie atau token tidak valid.
 * TIDAK throw -- biarkan route handler yang memutuskan response-nya.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Wajib login -- throw response 401 kalau tidak ada session.
 * Pemakaian di route handler:
 *   const session = await requireAuth();
 *   // kalau sampai sini, session pasti valid
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: 'Belum login atau sesi habis.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

/**
 * Wajib admin global (role='admin') -- throw 403 kalau bukan.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Akses ditolak: perlu hak admin.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

/**
 * Cek apakah user boleh kelola node tertentu (admin global ATAU admin cabang
 * yang scope-nya mencakup targetPersonId via ancestor check).
 * Return true = boleh, false = tidak boleh.
 *
 * Dipakai di route yang butuh kontrol granular per-node (misal: edit person).
 * Tidak dipakai di middleware (tidak bisa akses Prisma di Edge).
 */
export async function isAdminFor(userId: string, targetPersonId: string): Promise<boolean> {
  // Super admin -- akses semua tanpa perlu cek scope
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;
  if (user.role === 'admin') {
    const hasScope = await prisma.adminScope.count({ where: { userId } });
    if (hasScope === 0) return true; // super admin tanpa scope terbatas = akses semua
  }

  // Admin cabang -- cek apakah targetPersonId ada di subtree root_person_id
  const scopes = await prisma.adminScope.findMany({
    where: { userId },
    select: { rootPersonId: true },
  });
  if (scopes.length === 0) return false;

  // BFS naik dari target ke semua leluhurnya, cek apakah ada yg cocok dgn root scope
  const visited = new Set<string>();
  let frontier = [targetPersonId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      if (scopes.some((s: { rootPersonId: string }) => s.rootPersonId === id)) return true;
      const parents = await prisma.parentChild.findMany({
        where: { childId: id },
        select: { parentId: true },
      });
      next.push(...parents.map((p: { parentId: string }) => p.parentId));
    }
    frontier = next;
  }
  return false;
}

/**
 * Untuk endpoint yang me-LIST banyak orang sekaligus (persons GET, claims
 * GET) -- beda kebutuhan dari isAdminFor() yang cuma jawab ya/tidak untuk
 * SATU target. Di sini butuh SELURUH id yang boleh diakses, supaya list-nya
 * bisa di-filter.
 *
 * Return null = TIDAK dibatasi (super admin, tanpa AdminScope row apa pun)
 *   -- caller harus treat null sebagai "jangan filter apa-apa", BUKAN
 *      "array kosong = boleh akses semua". Bug gampang lolos di sini kalau
 *      null disamakan dengan [].
 * Return string[] = daftar id yang boleh diakses (root + SEMUA descendant-nya,
 *   gabungan dari semua AdminScope row user ini kalau lebih dari satu).
 * Return [] (array kosong, BEDA dari null) = admin tapi tidak punya scope
 *   valid sama sekali (seharusnya tidak terjadi kalau AdminScope selalu
 *   dibuat dengan benar, tapi dijaga defensif -- lebih aman "tidak boleh
 *   akses apa-apa" daripada asumsi salah ke arah "akses semua").
 */
export async function getScopedPersonIds(userId: string): Promise<string[] | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== 'admin') return [];

  const scopes = await prisma.adminScope.findMany({
    where: { userId },
    select: { rootPersonId: true },
  });
  if (scopes.length === 0) return null; // admin TANPA scope row = super admin, unrestricted

  // BFS TURUN dari tiap root ke semua descendant -- arah kebalikan dari
  // isAdminFor() yang BFS NAIK dari target ke leluhur.
  const visited = new Set<string>(scopes.map((s: { rootPersonId: string }) => s.rootPersonId));
  let frontier = Array.from(visited);
  while (frontier.length > 0) {
    const links = await prisma.parentChild.findMany({
      where: { parentId: { in: frontier } },
      select: { childId: true },
    });
    const nextIds = links
      .map((l: { childId: string }) => l.childId)
      .filter((id: string) => !visited.has(id));
    nextIds.forEach((id: string) => visited.add(id));
    frontier = nextIds;
  }
  return Array.from(visited);
}

// ============================================================
// Cookie helper -- set & clear, dipanggil dari login/logout route
// ============================================================

export function buildSessionCookie(token: string): string {
  // httpOnly: JS client tidak bisa akses cookie ini (mitigasi XSS)
  // Secure: hanya dikirim via HTTPS -- di local dev (HTTP) ini dimatikan
  //         via env variable supaya tidak ribet setup SSL lokal
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 60 * 60 * 24 * 7; // 7 hari (sama dgn TOKEN_EXPIRY)
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export { COOKIE_NAME };