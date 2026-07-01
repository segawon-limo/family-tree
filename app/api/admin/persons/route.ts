import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/auth';

// GET: semua member yang login boleh lihat daftar person
export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const persons = await prisma.person.findMany({
    where: { deletedAt: null },
    include: {
      parentsLink: {
        include: { parent: { select: { id: true, nama: true, gender: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  type PersonWithParents = {
    id: string;
    nama: string;
    gender: string;
    urutanKelahiran: number;
    tanggalLahir: Date | null;
    catatan: string | null;
    parentsLink: { parent: { id: string; nama: string; gender: string } }[];
  };

  const shaped = (persons as PersonWithParents[]).map((p) => {
    const bapak = p.parentsLink.find((pl) => pl.parent.gender === 'L')?.parent ?? null;
    const ibu = p.parentsLink.find((pl) => pl.parent.gender === 'P')?.parent ?? null;
    return {
      id: p.id,
      nama: p.nama,
      gender: p.gender,
      urutanKelahiran: p.urutanKelahiran,
      tanggalLahir: p.tanggalLahir,
      catatan: p.catatan,
      bapakId: bapak?.id ?? null,
      bapakNama: bapak?.nama ?? null,
      ibuId: ibu?.id ?? null,
      ibuNama: ibu?.nama ?? null,
    };
  });

  return NextResponse.json(shaped);
}

// POST: hanya admin yang boleh tambah person baru
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e) { return e as Response; }
  const body = await req.json();
  const { nama, gender, urutanKelahiran, tanggalLahir, bapakId, ibuId, tipe, catatan } = body;

  if (!nama || !gender || urutanKelahiran === undefined || urutanKelahiran === null) {
    return NextResponse.json(
      { error: 'Nama, gender, dan urutan kelahiran wajib diisi.' },
      { status: 400 }
    );
  }
  if (gender !== 'L' && gender !== 'P') {
    return NextResponse.json({ error: 'Gender harus L atau P.' }, { status: 400 });
  }

  if (bapakId) {
    const existing = await prisma.parentChild.findMany({
      where: { parentId: bapakId },
      include: { child: { select: { urutanKelahiran: true, deletedAt: true } } },
    });
    const dup = existing.some(
      (e: { child: { deletedAt: Date | null; urutanKelahiran: number } }) =>
        e.child.deletedAt === null && e.child.urutanKelahiran === Number(urutanKelahiran)
    );
    if (dup) {
      return NextResponse.json(
        {
          error: `Urutan kelahiran ${urutanKelahiran} sudah dipakai anak lain dari bapak yang sama. Cek lagi urutannya.`,
        },
        { status: 409 }
      );
    }
  }

  try {
    const person = await prisma.person.create({
      data: {
        nama,
        gender,
        urutanKelahiran: Number(urutanKelahiran),
        tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
        catatan: catatan || null,
      },
    });

    const relasiTipe = tipe === 'angkat' ? 'angkat' : 'kandung';
    if (bapakId) {
      await prisma.parentChild.create({
        data: { parentId: bapakId, childId: person.id, tipe: relasiTipe },
      });
    }
    if (ibuId) {
      await prisma.parentChild.create({
        data: { parentId: ibuId, childId: person.id, tipe: relasiTipe },
      });
    }

    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    // tangkap juga kalau trigger DB yang akhirnya menolak (jaring pengaman kedua)
    return NextResponse.json(
      { error: err?.message ?? 'Gagal membuat person.' },
      { status: 500 }
    );
  }
}