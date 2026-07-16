import { NextResponse } from 'next/server';
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

// GET /api/map
// Semua member login boleh lihat -- ini menampilkan kecamatan/kabupaten
// (bukan alamat lengkap), jadi levelnya dianggap cukup aman untuk seluruh
// keluarga lihat, sama seperti data lain di tree.
export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const kontaks = await prisma.personKontak.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      person: { deletedAt: null },
    },
    select: {
      personId: true,
      kecamatan: true,
      kabupatenKota: true,
      provinsi: true,
      latitude: true,
      longitude: true,
      person: { select: { nama: true, gender: true } },
    },
  });

  return NextResponse.json(
    kontaks.map((k) => ({
      personId: k.personId,
      nama: k.person.nama,
      gender: k.person.gender,
      kecamatan: k.kecamatan,
      kabupatenKota: k.kabupatenKota,
      provinsi: k.provinsi,
      latitude: k.latitude,
      longitude: k.longitude,
    }))
  );
}