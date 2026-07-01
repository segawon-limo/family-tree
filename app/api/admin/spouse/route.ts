import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/auth';

export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }
  const spouses = await prisma.spouse.findMany({
    include: {
      person1: { select: { nama: true } },
      person2: { select: { nama: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(spouses);
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e) { return e as Response; }
  const { person1Id, person2Id, status, tanggalNikah } = await req.json();
  const finalStatus = status || 'menikah';

  if (!person1Id || !person2Id) {
    return NextResponse.json({ error: 'Kedua pasangan wajib dipilih.' }, { status: 400 });
  }
  if (person1Id === person2Id) {
    return NextResponse.json({ error: 'Tidak bisa pasangan dengan diri sendiri.' }, { status: 400 });
  }

  // Validasi: tidak boleh ada 2 pernikahan status 'menikah' (aktif)
  // bersamaan untuk orang yang sama -- sesuai konfirmasi user bahwa
  // poligami simultan tidak terjadi di keluarga ini. Pernikahan
  // berurutan (setelah cerai/wafat) tetap diperbolehkan, makanya
  // cek ini HANYA berlaku kalau status baru = 'menikah'.
  if (finalStatus === 'menikah') {
    for (const pid of [person1Id, person2Id]) {
      const existingActive = await prisma.spouse.findFirst({
        where: {
          status: 'menikah',
          OR: [{ person1Id: pid }, { person2Id: pid }],
        },
        include: { person1: { select: { nama: true } }, person2: { select: { nama: true } } },
      });
      if (existingActive) {
        const nama = (await prisma.person.findUnique({ where: { id: pid }, select: { nama: true } }))?.nama;
        return NextResponse.json(
          {
            error: `${nama} sudah punya pernikahan aktif tercatat. Ubah status pernikahan lama jadi 'cerai'/'wafat' dulu kalau ini pernikahan baru (sesuai keputusan: tidak ada poligami simultan).`,
          },
          { status: 409 }
        );
      }
    }
  }

  try {
    const spouse = await prisma.spouse.create({
      data: {
        person1Id,
        person2Id,
        status: finalStatus,
        tanggalNikah: tanggalNikah ? new Date(tanggalNikah) : null,
      },
    });
    return NextResponse.json(spouse, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Gagal menyimpan relasi pasangan.' }, { status: 500 });
  }
}