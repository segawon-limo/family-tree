import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, getScopedPersonIds } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// GET /api/auth/me
// Dipakai client-side buat tau "siapa yang lagi login" -- dibutuhkan
// AppHeader (nama + tombol logout) dan halaman kalkulator panggilan
// (default "dari siapa" = diri sendiri). TIDAK ada endpoint ini
// sebelumnya karena middleware cuma nyisipin x-user-* ke HEADER REQUEST
// SERVER, client-side JS tidak bisa baca itu langsung -- makanya perlu
// endpoint kecil ini buat "mengembalikan" info yang sama ke browser.
export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { email: true },
  });

  let personNama: string | null = null;
  let hasFoto = false;
  if (session.personId) {
    const person = await prisma.person.findUnique({
      where: { id: session.personId },
      select: { nama: true, fotoPath: true },
    });
    personNama = person?.nama ?? null;
    hasFoto = !!person?.fotoPath;
  }

  // Super admin = role admin TANPA AdminScope row apa pun (unrestricted).
  // Dipakai client buat nampilin/nyembunyiin UI "kelola sub-admin" --
  // sub-admin (scoped) TIDAK boleh grant/revoke scope ke orang lain,
  // itu privilege escalation kalau dibiarkan.
  const isSuperAdmin =
    session.role === 'admin' && (await getScopedPersonIds(session.sub)) === null;

  return NextResponse.json({
    userId: session.sub,
    role: session.role,
    personId: session.personId,
    personNama,
    email: user?.email ?? null,
    fotoUrl: hasFoto && session.personId ? `/api/foto/${session.personId}` : null,
    isSuperAdmin,
  });
}