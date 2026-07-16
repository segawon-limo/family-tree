import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAdminFor } from '@/lib/auth';
import { geocodeKecamatanOrKabupaten } from '@/lib/geocode';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// GET: admin (global/scoped) lihat lokasi person untuk pra-isi form edit.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try { session = await requireAuth(); } catch (e) { return e as Response; }
  const { id } = params;
  const allowed = session.role === 'admin' || (await isAdminFor(session.sub, id));
  if (!allowed) {
    return NextResponse.json({ error: 'Akses ditolak: kamu bukan admin untuk node ini.' }, { status: 403 });
  }

  const kontak = await prisma.personKontak.findUnique({
    where: { personId: id },
    select: { kecamatan: true, kabupatenKota: true, provinsi: true, latitude: true, longitude: true, geocodedAt: true },
  });

  return NextResponse.json(
    kontak ?? { kecamatan: null, kabupatenKota: null, provinsi: null, latitude: null, longitude: null, geocodedAt: null }
  );
}

// PUT: admin (global/scoped) update kecamatan/kabupaten/provinsi person ini.
// Body: { kecamatan?: string, kabupatenKota?: string, provinsi?: string }
//
// Geocoding dipicu SINKRON di sini (bukan background job) -- konsekuensinya
// request ini bisa makan waktu ~1 detik (throttle Nominatim, lihat
// lib/geocode.ts). Untuk form admin yang disubmit manual sesekali ini
// acceptable; JANGAN panggil endpoint ini dari loop/bulk-import tanpa jeda,
// itu melanggar kebijakan Nominatim (lihat komentar di lib/geocode.ts).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let session;
  try { session = await requireAuth(); } catch (e) { return e as Response; }
  const { id } = params;
  const allowed = session.role === 'admin' || (await isAdminFor(session.sub, id));
  if (!allowed) {
    return NextResponse.json({ error: 'Akses ditolak: kamu bukan admin untuk node ini.' }, { status: 403 });
  }

  const person = await prisma.person.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!person || person.deletedAt) {
    return NextResponse.json({ error: 'Person tidak ditemukan.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const kecamatan = typeof body.kecamatan === 'string' ? body.kecamatan.trim() || null : null;
  const kabupatenKota = typeof body.kabupatenKota === 'string' ? body.kabupatenKota.trim() || null : null;
  const provinsi = typeof body.provinsi === 'string' ? body.provinsi.trim() || null : null;

  if (!kecamatan && !kabupatenKota) {
    return NextResponse.json(
      { error: 'Isi minimal kecamatan atau kabupaten/kota.' },
      { status: 400 }
    );
  }

  let geocode: { latitude: number; longitude: number } | null = null;
  try {
    geocode = await geocodeKecamatanOrKabupaten({ kecamatan, kabupatenKota, provinsi });
  } catch (err: any) {
    // Nominatim down/timeout dsb -- jangan gagalkan seluruh simpan gara-gara
    // ini, simpan kecamatan/kabupatennya dulu tanpa koordinat. Admin bisa
    // simpan ulang nanti supaya di-geocode ulang.
    console.error(`[lokasi] geocoding gagal untuk person ${id}:`, err?.message ?? err);
  }

  // Kalau geocoding gagal SEKARANG (bukan karena kecamatan/kabupaten-nya
  // memang tidak diisi, tapi karena Nominatim gagal/network blip), jangan
  // timpa koordinat lama yang sudah tersimpan dari percobaan sebelumnya --
  // itu regresi diam-diam (marker yang tadinya muncul di peta jadi hilang
  // cuma gara-gara admin edit pekerjaan orang itu, misalnya).
  const existing = await prisma.personKontak.findUnique({
    where: { personId: id },
    select: { kecamatan: true, kabupatenKota: true, latitude: true, longitude: true, geocodedAt: true },
  });

  // Cuma pakai koordinat cache lama kalau kecamatan/kabupaten-nya SAMA
  // dengan sebelumnya (berarti geocode gagal karena Nominatim bermasalah,
  // bukan karena lokasinya memang berubah). Kalau kecamatan/kabupaten
  // berubah tapi geocode baru gagal, JANGAN pakai koordinat lama -- itu
  // akan jadi marker yang salah tempat (nunjuk lokasi lama, padahal teks
  // yang ditampilkan sudah lokasi baru).
  const lokasiSama = existing?.kecamatan === kecamatan && existing?.kabupatenKota === kabupatenKota;
  const latitude = geocode?.latitude ?? (lokasiSama ? existing?.latitude ?? null : null);
  const longitude = geocode?.longitude ?? (lokasiSama ? existing?.longitude ?? null : null);
  const geocodedAt = geocode ? new Date() : (lokasiSama ? existing?.geocodedAt ?? null : null);

  const saved = await prisma.personKontak.upsert({
    where: { personId: id },
    create: {
      personId: id,
      kecamatan,
      kabupatenKota,
      provinsi,
      latitude,
      longitude,
      geocodedAt,
    },
    update: {
      kecamatan,
      kabupatenKota,
      provinsi,
      latitude,
      longitude,
      geocodedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    geocoded: !!geocode,
    kecamatan: saved.kecamatan,
    kabupatenKota: saved.kabupatenKota,
    provinsi: saved.provinsi,
    latitude: saved.latitude,
    longitude: saved.longitude,
  });
}