import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// Keputusan produk (dikonfirmasi eksplisit, bukan default diam-diam):
// member CUMA boleh edit/hapus agenda buatannya SENDIRI. TIDAK ada
// override admin untuk moderasi/hapus punya orang lain di endpoint ini.
// Kalau nanti kebutuhan moderasi muncul (agenda tidak pantas dsb),
// itu perlu keputusan produk baru + endpoint terpisah -- jangan
// tambahkan bypass admin di sini tanpa diskusi ulang.
async function loadOwnedAgendaOr403(id: string, userId: string) {
  const agenda = await prisma.calendarAgenda.findUnique({ where: { id } });
  if (!agenda) {
    return { error: NextResponse.json({ error: 'Agenda tidak ditemukan.' }, { status: 404 }) };
  }
  if (agenda.createdByUserId !== userId) {
    return { error: NextResponse.json({ error: 'Kamu cuma bisa mengubah/menghapus agenda buatanmu sendiri.' }, { status: 403 }) };
  }
  return { agenda };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const { agenda, error } = await loadOwnedAgendaOr403(params.id, session.sub);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const data: { judul?: string; deskripsi?: string | null; tanggal?: Date } = {};

  if (body.judul !== undefined) {
    const judul = typeof body.judul === 'string' ? body.judul.trim() : '';
    if (judul.length < 2 || judul.length > 255) {
      return NextResponse.json({ error: 'Judul agenda harus 2-255 karakter.' }, { status: 400 });
    }
    data.judul = judul;
  }
  if (body.deskripsi !== undefined) {
    data.deskripsi = typeof body.deskripsi === 'string' ? body.deskripsi.trim() || null : null;
  }
  if (body.tanggal !== undefined) {
    if (typeof body.tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.tanggal)) {
      return NextResponse.json({ error: 'Tanggal wajib format YYYY-MM-DD.' }, { status: 400 });
    }
    const tanggal = new Date(body.tanggal + 'T00:00:00.000Z');
    if (Number.isNaN(tanggal.getTime())) {
      return NextResponse.json({ error: 'Tanggal tidak valid.' }, { status: 400 });
    }
    data.tanggal = tanggal;
  }

  const updated = await prisma.calendarAgenda.update({ where: { id: agenda!.id }, data });

  return NextResponse.json({
    ok: true,
    agenda: {
      id: updated.id,
      judul: updated.judul,
      deskripsi: updated.deskripsi,
      tanggal: updated.tanggal.toISOString().slice(0, 10),
      createdByUserId: updated.createdByUserId,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const { agenda, error } = await loadOwnedAgendaOr403(params.id, session.sub);
  if (error) return error;

  await prisma.calendarAgenda.delete({ where: { id: agenda!.id } });
  return NextResponse.json({ ok: true });
}