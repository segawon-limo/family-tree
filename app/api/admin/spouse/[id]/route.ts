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

async function checkSpouseInScope(userId: string, spouseId: string): Promise<boolean> {
  const scopedIds = await getScopedPersonIds(userId);
  if (scopedIds === null) return true; // super admin, unrestricted
  const spouse = await prisma.spouse.findUnique({
    where: { id: spouseId },
    select: { person1Id: true, person2Id: true },
  });
  if (!spouse) return false;
  return scopedIds.includes(spouse.person1Id) || scopedIds.includes(spouse.person2Id);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }
  const { id } = params;
  if (!(await checkSpouseInScope(session.sub, id))) {
    return NextResponse.json({ error: 'Relasi ini di luar cabang keluarga yang jadi tanggung jawabmu.' }, { status: 403 });
  }
  await prisma.spouse.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }
  const { id } = params;
  if (!(await checkSpouseInScope(session.sub, id))) {
    return NextResponse.json({ error: 'Relasi ini di luar cabang keluarga yang jadi tanggung jawabmu.' }, { status: 403 });
  }
  const { status } = await req.json();
  if (!['menikah', 'cerai', 'wafat'].includes(status)) {
    return NextResponse.json({ error: 'Status tidak valid.' }, { status: 400 });
  }
  const updated = await prisma.spouse.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}