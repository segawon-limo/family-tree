import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { tentukanPanggilan } from '@/lib/familyCalc';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// GET /api/calendar?year=2026&month=7 (month 1-12)
//
// Gabungan DUA sumber, dihitung/diambil di request yang sama:
// 1. Tanda ulang tahun & peringatan wafat -- DIHITUNG dinamis dari
//    person.tanggal_lahir / tanggal_wafat (bulan+tanggal cocok dengan
//    bulan yang diminta, tahun berapa pun). Bukan disimpan di DB.
// 2. Agenda custom dari tabel calendar_agenda untuk bulan itu.
//
// Siapapun yang sudah login (member/admin) boleh lihat -- tidak ada
// scoping per-cabang di sini (beda dari /admin/persons), karena
// kalender itu untuk seluruh keluarga, bukan per-cabang.
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? '', 10);
  const month = parseInt(searchParams.get('month') ?? '', 10); // 1-12

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Parameter year dan month (1-12) wajib diisi dengan benar.' }, { status: 400 });
  }

  // --- 1. Ulang tahun & peringatan wafat ---
  // Ambil SEMUA person dengan tanggal_lahir/tanggal_wafat terisi, lalu
  // filter bulannya di JS -- bukan filter bulan lewat SQL EXTRACT(MONTH)
  // supaya tidak bergantung pada dialek Postgres date function di lapisan
  // Prisma query builder (lebih portable, dan datanya kecil ~puluhan orang
  // jadi tidak masalah performa).
  const personsWithDates = await prisma.person.findMany({
    where: {
      deletedAt: null,
      OR: [{ tanggalLahir: { not: null } }, { tanggalWafat: { not: null } }],
    },
    select: { id: true, nama: true, tanggalLahir: true, tanggalWafat: true },
  });

  const thisYear = year;
  const ulangTahun: Array<{ personId: string; nama: string; tanggal: string; usia: number }> = [];
  const peringatanWafat: Array<{ personId: string; nama: string; panggilan: string | null; tanggal: string; tahunKe: number }> = [];

  for (const p of personsWithDates) {
    // Ulang tahun HANYA untuk yang masih hidup. Orang yang sudah wafat tidak
    // "berulang tahun" lagi -- momennya digantikan peringatan wafat di bawah,
    // bukan ditampilkan dua-duanya.
    if (p.tanggalLahir && !p.tanggalWafat) {
      const d = p.tanggalLahir;
      if (d.getUTCMonth() + 1 === month) {
        const usia = thisYear - d.getUTCFullYear();
        if (usia >= 0) {
          ulangTahun.push({
            personId: p.id,
            nama: p.nama,
            tanggal: `${thisYear}-${String(month).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
            usia,
          });
        }
      }
    }
    if (p.tanggalWafat) {
      const d = p.tanggalWafat;
      if (d.getUTCMonth() + 1 === month) {
        const tahunKe = thisYear - d.getUTCFullYear();
        // Dibatasi maksimal 10 tahun -- setelah itu tidak ada notifikasi lagi
        // (keputusan produk eksplisit, bukan lupa nulis batas atas).
        if (tahunKe > 0 && tahunKe <= 10) {
          let panggilan: string | null = null;
          if (session.personId && session.personId !== p.id) {
            try {
              const hasil = await tentukanPanggilan(prisma, session.personId, p.id);
              // 'tidak ada hubungan keluarga tercatat' itu bukan error (tidak throw),
              // tapi juga bukan panggilan yang enak ditempel ke kalimat -- treat
              // sebagai "tidak ada panggilan" juga.
              if (hasil && hasil !== 'tidak ada hubungan keluarga tercatat' && hasil !== 'diri sendiri') {
                panggilan = hasil;
              }
            } catch (err: any) {
              // Sama seperti di /api/panggilan/[fromId]/route.ts -- perhitungan
              // panggilan bisa gagal untuk hubungan jauh yang belum tervalidasi.
              // Jangan biarkan itu bikin seluruh endpoint kalender error --
              // fallback ke null (frontend tampil tanpa panggilan), log saja.
              console.error(`[calendar] gagal hitung panggilan ${session.personId} -> ${p.id}:`, err?.message ?? err);
            }
          }
          peringatanWafat.push({
            personId: p.id,
            nama: p.nama,
            panggilan,
            tanggal: `${thisYear}-${String(month).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
            tahunKe,
          });
        }
      }
    }
  }

  // --- 2. Anniversary pernikahan ---
  // Sama seperti ulang tahun -- dihitung dinamis dari spouse.tanggal_nikah,
  // bukan disimpan. Ditampilkan HANYA kalau status 'menikah' DAN kedua
  // person masih hidup. Sengaja cek tanggal_wafat kedua person langsung
  // (bukan cuma percaya status='menikah' di tabel spouse) -- data status
  // bisa saja belum di-update manual oleh admin walau salah satu pasangan
  // sudah wafat, dan pengecekan tanggal_wafat lebih dapat diandalkan.
  const spousesWithDate = await prisma.spouse.findMany({
    where: { status: 'menikah', tanggalNikah: { not: null } },
    select: {
      id: true,
      tanggalNikah: true,
      person1: { select: { nama: true, tanggalWafat: true } },
      person2: { select: { nama: true, tanggalWafat: true } },
    },
  });

  const pernikahan: Array<{ spouseId: string; nama1: string; nama2: string; tanggal: string; tahunKe: number }> = [];
  for (const s of spousesWithDate) {
    if (s.person1.tanggalWafat || s.person2.tanggalWafat) continue;
    const d = s.tanggalNikah!;
    if (d.getUTCMonth() + 1 === month) {
      const tahunKe = thisYear - d.getUTCFullYear();
      if (tahunKe > 0) {
        pernikahan.push({
          spouseId: s.id,
          nama1: s.person1.nama,
          nama2: s.person2.nama,
          tanggal: `${thisYear}-${String(month).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
          tahunKe,
        });
      }
    }
  }

  // --- 3. Agenda custom ---
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));

  const agenda = await prisma.calendarAgenda.findMany({
    where: { tanggal: { gte: startOfMonth, lt: startOfNextMonth } },
    include: { createdBy: { select: { id: true, personId: true } } },
    orderBy: { tanggal: 'asc' },
  });

  return NextResponse.json({
    ulangTahun,
    peringatanWafat,
    pernikahan,
    agenda: agenda.map((a) => ({
      id: a.id,
      judul: a.judul,
      deskripsi: a.deskripsi,
      tanggal: a.tanggal.toISOString().slice(0, 10),
      createdByUserId: a.createdByUserId,
    })),
  });
}

// POST /api/calendar
// Body: { judul: string, deskripsi?: string, tanggal: 'YYYY-MM-DD' }
// Siapapun yang login (member/admin) boleh nambah -- ini fitur pertama
// di app ini yang kasih hak tulis ke member biasa, bukan cuma admin.
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const judul = typeof body.judul === 'string' ? body.judul.trim() : '';
  const deskripsi = typeof body.deskripsi === 'string' ? body.deskripsi.trim() : null;
  const tanggalStr = typeof body.tanggal === 'string' ? body.tanggal : '';

  if (judul.length < 2) {
    return NextResponse.json({ error: 'Judul agenda minimal 2 karakter.' }, { status: 400 });
  }
  if (judul.length > 255) {
    return NextResponse.json({ error: 'Judul agenda maksimal 255 karakter.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)) {
    return NextResponse.json({ error: 'Tanggal wajib format YYYY-MM-DD.' }, { status: 400 });
  }
  const tanggal = new Date(tanggalStr + 'T00:00:00.000Z');
  if (Number.isNaN(tanggal.getTime())) {
    return NextResponse.json({ error: 'Tanggal tidak valid.' }, { status: 400 });
  }

  const created = await prisma.calendarAgenda.create({
    data: {
      createdByUserId: session.sub,
      judul,
      deskripsi: deskripsi || null,
      tanggal,
    },
  });

  return NextResponse.json({
    ok: true,
    agenda: {
      id: created.id,
      judul: created.judul,
      deskripsi: created.deskripsi,
      tanggal: created.tanggal.toISOString().slice(0, 10),
      createdByUserId: created.createdByUserId,
    },
  });
}