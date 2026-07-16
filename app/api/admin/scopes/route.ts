import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getScopedPersonIds } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// Cuma super admin (role admin TANPA AdminScope row) yang boleh
// grant/lihat scope orang lain. Kalau sub-admin bisa akses ini, dia bisa
// kasih dirinya sendiri (atau orang lain) scope lebih luas -- privilege
// escalation.
async function requireSuperAdmin() {
  const session = await requireAdmin();
  const scopedIds = await getScopedPersonIds(session.sub);
  if (scopedIds !== null) {
    throw new Response(
      JSON.stringify({ error: 'Cuma admin utama yang bisa mengelola sub-admin.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return session;
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return e as Response;
  }

  const scopes = await prisma.adminScope.findMany({
    include: {
      user: { select: { id: true, email: true, noHpLogin: true } },
      rootPerson: { select: { id: true, nama: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(scopes);
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return e as Response;
  }

  const { userId, rootPersonId } = await req.json();
  if (!userId || !rootPersonId) {
    return NextResponse.json({ error: 'User dan root person wajib dipilih.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) {
    return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  }
  const person = await prisma.person.findUnique({ where: { id: rootPersonId }, select: { id: true } });
  if (!person) {
    return NextResponse.json({ error: 'Person tidak ditemukan.' }, { status: 404 });
  }

  const existing = await prisma.adminScope.findUnique({
    where: { userId_rootPersonId: { userId, rootPersonId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Scope ini sudah ada.' }, { status: 409 });
  }

  // Promosikan role ke admin kalau belum -- tanpa ini, sub-admin ke-block
  // middleware sebelum sempat masuk halaman /admin sama sekali (lihat
  // middleware.ts: ADMIN_ONLY_PAGES butuh payload.role === 'admin').
  const [, scope] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role: 'admin' } }),
    prisma.adminScope.create({ data: { userId, rootPersonId } }),
  ]);

  return NextResponse.json({ ok: true, scope });
}