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

// GET /api/persons/[id]/profile
//
// Data silsilah SAJA (nama, tanggal, foto, orang tua, pasangan, anak) --
// SENGAJA TIDAK termasuk info kontak (no HP, kecamatan/kabupaten,
// pekerjaan dari person_kontak) dan TIDAK termasuk "panggilan" personal
// relatif ke viewer -- dua-duanya keputusan eksplisit, bukan lupa:
// - kontak: ditunda, belum diputuskan mau ditampilkan atau tidak
// - panggilan: butuh session.personId asli utk aman: dropdown
//   viewerId di /tree itu SEMENTARA (belum ada auth asli), bawa itu ke
//   sini berarti memperluas hack yang sama ke tempat baru. Ditunda
//   sampai auth asli beres, BUKAN diam-diam di-skip tanpa catatan.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const { id } = params;

  const person = await prisma.person.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      nama: true,
      gender: true,
      tanggalLahir: true,
      tanggalWafat: true,
      catatan: true,
      fotoPath: true,
    },
  });

  if (!person) {
    return NextResponse.json({ error: 'Person tidak ditemukan.' }, { status: 404 });
  }

  const [parentLinks, childLinks, spouseLinksAsP1, spouseLinksAsP2] = await Promise.all([
    prisma.parentChild.findMany({
      where: { childId: id },
      include: { parent: { select: { id: true, nama: true, gender: true, fotoPath: true } } },
    }),
    prisma.parentChild.findMany({
      where: { parentId: id },
      include: { child: { select: { id: true, nama: true, gender: true, fotoPath: true } } },
    }),
    prisma.spouse.findMany({
      where: { person1Id: id },
      include: { person2: { select: { id: true, nama: true, gender: true, fotoPath: true } } },
    }),
    prisma.spouse.findMany({
      where: { person2Id: id },
      include: { person1: { select: { id: true, nama: true, gender: true, fotoPath: true } } },
    }),
  ]);

  function toFotoUrl(fotoPath: string | null, personId: string) {
    return fotoPath ? `/api/admin/persons/${personId}/foto` : null;
  }

  const orangTua = parentLinks.map((pl) => ({
    id: pl.parent.id,
    nama: pl.parent.nama,
    gender: pl.parent.gender,
    fotoUrl: toFotoUrl(pl.parent.fotoPath, pl.parent.id),
  }));

  const anak = childLinks.map((cl) => ({
    id: cl.child.id,
    nama: cl.child.nama,
    gender: cl.child.gender,
    fotoUrl: toFotoUrl(cl.child.fotoPath, cl.child.id),
  }));

  const pasangan = [
    ...spouseLinksAsP1.map((s) => ({
      id: s.person2.id,
      nama: s.person2.nama,
      gender: s.person2.gender,
      fotoUrl: toFotoUrl(s.person2.fotoPath, s.person2.id),
      status: s.status,
      tanggalNikah: s.tanggalNikah,
    })),
    ...spouseLinksAsP2.map((s) => ({
      id: s.person1.id,
      nama: s.person1.nama,
      gender: s.person1.gender,
      fotoUrl: toFotoUrl(s.person1.fotoPath, s.person1.id),
      status: s.status,
      tanggalNikah: s.tanggalNikah,
    })),
  ];

  return NextResponse.json({
    id: person.id,
    nama: person.nama,
    gender: person.gender,
    tanggalLahir: person.tanggalLahir,
    tanggalWafat: person.tanggalWafat,
    catatan: person.catatan,
    fotoUrl: toFotoUrl(person.fotoPath, person.id),
    orangTua,
    pasangan,
    anak,
  });
}