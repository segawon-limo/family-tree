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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  const scopedIds = await getScopedPersonIds(session.sub);
  if (scopedIds !== null) {
    return NextResponse.json(
      { error: 'Cuma admin utama yang bisa mengelola sub-admin.' },
      { status: 403 }
    );
  }

  // Ambil userId dari scope yang mau dihapus DULU -- butuh ini setelah
  // delete untuk cek sisa scope user tsb.
  const scopeToDelete = await prisma.adminScope.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!scopeToDelete) {
    return NextResponse.json({ error: 'Scope tidak ditemukan.' }, { status: 404 });
  }

  await prisma.adminScope.delete({ where: { id: params.id } });

  // Kalau user itu sudah tidak punya AdminScope lain sama sekali setelah ini,
  // turunkan role balik ke 'member'. TANPA ini, role='admin' + 0 AdminScope
  // row = didefinisikan sebagai SUPER ADMIN oleh isAdminFor()/getScopedPersonIds()
  // -- jadi revoke satu-satunya scope tanpa demote ini justru menaikkan
  // privilege user, bukan mencabutnya. Kalau user masih punya scope lain
  // (admin multi-cabang), role admin-nya dipertahankan.
  const remaining = await prisma.adminScope.count({
    where: { userId: scopeToDelete.userId },
  });
  if (remaining === 0) {
    await prisma.user.update({
      where: { id: scopeToDelete.userId },
      data: { role: 'member' },
    });
  }

  return NextResponse.json({ ok: true });
}