import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// POST /api/auth/register
// Body menentukan action. `kode` WAJIB dikirim ulang di setiap action
// selain 'validate-code' -- tidak ada session/token setelah step 1,
// jadi server revalidasi kode di setiap request (lihat isValidKode()).
//   { action: 'validate-code', kode }
//   { action: 'search', query, kode }  ← cari person by nama (untuk step 3)
//   { action: 'claim', personId, email, noHp, kode }
//   { action: 'not-found', namaDicari, email, noHp, catatan, kode }

// ============================================================
// Rate limit sederhana untuk validasi kode (in-memory, per proses).
// Menghitung PERCOBAAN GAGAL saja -- kode yang benar tidak pernah
// menambah counter, jadi user asli bebas search berkali-kali tanpa
// risiko ke-block sendiri. Attacker yang nebak-nebak kode salah
// yang kena limit, lewat action manapun (validate-code, search,
// claim, not-found semuanya mem-validasi kode).
//
// CATATAN PENTING:
// - Efektif HANYA jika reverse proxy (nginx) meng-overwrite header
//   X-Forwarded-For dari client, bukan sekadar forward apa adanya.
//   Kalau tidak, attacker bisa spoof header ini dan limit ini percuma.
// - Efektif HANYA jika proses Next.js single-instance (bukan PM2
//   cluster mode). Kalau cluster, tiap worker punya memory sendiri
//   dan limit ini bisa dilewati dengan gampang.
// - State hilang setiap kali proses restart/deploy -- acceptable
//   untuk skala app keluarga ini, TIDAK acceptable untuk app publik.
// ============================================================
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 menit
const RATE_LIMIT_MAX_FAILURES = 8;
const failureLog = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  const real = req.headers.get('x-real-ip');
  // TODO SEBELUM DEPLOY: split(',')[0] percaya entry PALING KIRI di XFF,
  // yaitu yang ditulis CLIENT sendiri (bisa dipalsukan). Kalau nginx
  // production pakai `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
  // (append di kanan, bukan overwrite), entry yang bisa dipercaya itu paling
  // KANAN (hop terakhir sebelum request nyampe ke Next.js), bukan paling kiri.
  // JANGAN deploy dengan logic ini tanpa konfirmasi topology proxy yang
  // sebenarnya (single nginx? ada CDN/load-balancer di depannya?).
  if (xff && xff.split(',')[0].trim()) return xff.split(',')[0].trim();
  if (real) return real;
  // Tidak bisa identifikasi IP asli (localhost tanpa proxy, atau nginx
  // belum di-set benar). JANGAN treat semua user sebagai satu key
  // 'unknown' -- itu bikin satu attacker bisa ngeblok semua user asli
  // sekaligus. Return null: rate limit di-skip untuk kasus ini
  // (fail-open), bukan fail-closed-untuk-semua-orang.
  return null;
}

// PERBAIKAN RACE CONDITION (sebelumnya): isIpBlocked() dicek SEBELUM await
// ke Prisma, recordFailure() dipanggil SESUDAH await selesai. Di antara dua
// titik itu ada celah -- request konkuren lain bisa lolos isIpBlocked()
// sebelum request pertama sempat increment counter-nya. Terverifikasi lewat
// test: 20 request konkuren dengan limit 8 meloloskan 10-12 request sebagai
// 401, bukan cuma 8.
//
// FIX: gabungkan "cek" dan "reserve slot" jadi SATU operasi SYNCHRONOUS,
// dipanggil sekali di paling atas POST() sebelum ada `await` apapun. Karena
// Node cuma single-threaded dan kode synchronous jalan sampai selesai tanpa
// diselingi request lain (interleaving cuma terjadi di titik `await`), reserve
// di sini dijamin atomic lintas request konkuren. Kalau kode-nya ternyata
// BENAR (baru diketahui setelah await ke Prisma selesai), slot yang sudah
// direserve dilepas lagi lewat releaseReservation() -- supaya kode benar
// tetap tidak ikut kena limit (aturan lama tetap dipertahankan).
function checkAndReserve(ip: string | null): boolean {
  if (!ip) return false; // fail-open untuk IP yang tidak terdeteksi (lihat getClientIp)
  const now = Date.now();
  const entry = failureLog.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    failureLog.set(ip, { count: 1, windowStart: now });
    return false; // tidak diblokir, sekaligus mereservasi slot pertama
  }
  if (entry.count >= RATE_LIMIT_MAX_FAILURES) {
    return true; // diblokir -- TIDAK increment lagi, sudah penuh
  }
  entry.count += 1; // reservasi slot -- terjadi SYNCHRONOUS, sebelum await manapun
  return false;
}

function releaseReservation(ip: string | null) {
  if (!ip) return;
  const entry = failureLog.get(ip);
  if (entry && entry.count > 0) entry.count -= 1;
}

function cleanupFailureLog() {
  const now = Date.now();
  for (const [ip, entry] of failureLog.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      failureLog.delete(ip);
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  cleanupFailureLog();
  const ip = getClientIp(req);
  // Reserve TERJADI DI SINI, synchronous, sebelum action manapun diproses --
  // ini titik atomicity-nya. Jangan pindahkan reserve ke dalam handler yang
  // ada await sebelumnya, itu membuka celah race yang sama lagi.
  if (checkAndReserve(ip)) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' },
      { status: 429 }
    );
  }

  switch (action) {
    case 'validate-code':
      return handleValidateCode(body, ip);
    case 'search':
      return handleSearch(body, ip);
    case 'claim':
      return handleClaim(body, ip);
    case 'not-found':
      return handleNotFound(body, ip);
    default:
      // Action tidak dikenali -- slot sudah terlanjur direservasi di atas.
      // Bukan percobaan kode sama sekali, jadi lepas lagi supaya tidak
      // ikut menghitung ke limit orang yang salah ketik action.
      releaseReservation(ip);
      return NextResponse.json({ error: 'Action tidak dikenali.' }, { status: 400 });
  }
}

// ============================================================
// Step 1: validasi kode keluarga
// ============================================================
async function handleValidateCode(body: { kode?: string }, ip: string | null) {
  const { kode } = body;
  if (!kode?.trim()) {
    return NextResponse.json({ error: 'Kode keluarga wajib diisi.' }, { status: 400 });
  }

  const found = await prisma.kodeKeluarga.findFirst({
    where: {
      kode: kode.trim(),
      aktif: true,
      OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
    },
  });

  if (!found) {
    // TIDAK perlu recordFailure -- slot sudah direservasi synchronous di
    // POST() sebelum handler ini dipanggil. Diamkan saja, biarkan tetap
    // "terpakai" di failureLog.
    return NextResponse.json(
      { error: 'Kode tidak valid atau sudah kedaluwarsa. Hubungi admin keluarga.' },
      { status: 401 }
    );
  }

  releaseReservation(ip); // kode benar -- lepas slot, jangan ikut kena limit
  return NextResponse.json({ ok: true });
}

// ============================================================
// Helper: revalidasi kode keluarga di setiap action setelah step 1.
// Kode TIDAK menghasilkan session/token apapun -- client wajib
// kirim ulang kode di body setiap action (search, claim, not-found).
// Reservasi slot rate-limit sudah terjadi di POST() sebelum fungsi ini
// dipanggil -- di sini cuma perlu LEPAS slotnya kalau kode ternyata benar.
// ============================================================
async function isValidKode(kode: string | undefined, ip: string | null): Promise<boolean> {
  if (!kode?.trim()) {
    return false; // slot sudah kepakai dari reservasi di POST(), tidak perlu apa-apa lagi
  }
  const found = await prisma.kodeKeluarga.findFirst({
    where: {
      kode: kode.trim(),
      aktif: true,
      OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (!found) {
    return false;
  }
  releaseReservation(ip); // kode benar -- lepas slot
  return true;
}

function invalidKodeResponse() {
  return NextResponse.json(
    { error: 'Sesi tidak valid. Ulangi dari awal dan masukkan kode keluarga.' },
    { status: 401 }
  );
}

// ============================================================
// Step 3: cari person by nama (belum diklaim)
// Tampilkan bin/binti + catatan kalau tidak ada bapak
// ============================================================
async function handleSearch(body: { query?: string; kode?: string }, ip: string | null) {
  const { query, kode } = body;
  if (!(await isValidKode(kode, ip))) {
    return invalidKodeResponse();
  }
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const persons = await prisma.person.findMany({
    where: {
      deletedAt: null,
      statusKlaim: 'unclaimed',
      nama: { contains: query.trim(), mode: 'insensitive' },
    },
    take: 20,
    include: {
      parentsLink: {
        include: { parent: { select: { id: true, nama: true, gender: true } } },
      },
    },
  });

  type PersonWithParents = typeof persons[number];
  const results = persons.map((p: PersonWithParents) => {
    const bapak = p.parentsLink.find((l: { parent: { id: string; nama: string; gender: string } }) => l.parent.gender === 'L')?.parent;
    const particle = p.gender === 'L' ? 'bin' : 'binti';
    const disambiguator = bapak
      ? `${particle} ${bapak.nama}`
      : p.catatan
      ? p.catatan
      : null;

    return {
      id: p.id,
      nama: p.nama,
      gender: p.gender,
      disambiguator,
    };
  });

  return NextResponse.json({ results });
}

// ============================================================
// Step 4: submit klaim
// ============================================================
async function handleClaim(body: {
  personId?: string;
  email?: string;
  noHp?: string;
  kode?: string;
}, ip: string | null) {
  const { personId, email, noHp, kode } = body;

  if (!(await isValidKode(kode, ip))) {
    return invalidKodeResponse();
  }

  if (!personId || !email) {
    return NextResponse.json({ error: 'Person dan email wajib diisi.' }, { status: 400 });
  }

  // Cek email belum dipakai
  const emailExists = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
  });
  if (emailExists) {
    return NextResponse.json(
      { error: 'Email ini sudah terdaftar. Coba login, atau hubungi admin kalau ada masalah.' },
      { status: 409 }
    );
  }

  // Cek klaim pending/approved untuk person ini belum ada
  const existingKlaim = await prisma.klaimRequest.findFirst({
    where: { personId, status: { in: ['pending', 'approved'] } },
  });
  if (existingKlaim) {
    return NextResponse.json(
      { error: 'Nama ini sudah ada yang klaim atau sedang dalam proses persetujuan.' },
      { status: 409 }
    );
  }

  // Cek person masih unclaimed
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { statusKlaim: true, nama: true },
  });
  if (!person || person.statusKlaim !== 'unclaimed') {
    return NextResponse.json(
      { error: 'Nama ini sudah diklaim orang lain.' },
      { status: 409 }
    );
  }

  // Buat placeholder user dulu (tanpa password, tanpa person_id)
  // supaya klaim_request bisa punya FK ke users.
  // User ini BELUM bisa login (tidak ada password_hash, dan person_id null).
  // Akan di-update saat setup-password setelah admin approve.
  const placeholder = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      noHpLogin: noHp?.trim() || null,
      // password_hash tidak boleh null di skema, isi dgn string yg tidak bisa
      // di-decode jadi password valid -- prefixed utk mudah diidentifikasi
      passwordHash: '__PENDING_SETUP__',
      role: 'member',
    },
  });

  // Update status person & buat klaim_request
  await prisma.person.update({
    where: { id: personId },
    data: { statusKlaim: 'pending_approval' },
  });

  await prisma.klaimRequest.create({
    data: {
      userId: placeholder.id,
      personId,
      email: email.toLowerCase().trim(),
      noHp: noHp?.trim() || null,
      status: 'pending',
    },
  });

  return NextResponse.json({
    ok: true,
    message: 'Permintaan klaim berhasil dikirim. Admin akan menghubungimu setelah disetujui.',
  });
}

// ============================================================
// Step 3 (nama tidak ketemu): kirim notif ke admin
// ============================================================
async function handleNotFound(body: {
  namaDicari?: string;
  email?: string;
  noHp?: string;
  catatan?: string;
  kode?: string;
}, ip: string | null) {
  const { namaDicari, email, catatan, noHp, kode } = body;
  if (!(await isValidKode(kode, ip))) {
    return invalidKodeResponse();
  }
  if (!namaDicari?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Nama dan email wajib diisi.' }, { status: 400 });
  }

  await prisma.registerInquiry.create({
    data: {
      namaDicari: namaDicari.trim(),
      email: email.toLowerCase().trim(),
      noHp: noHp?.trim() || null,
      catatan: catatan?.trim() || null,
    },
  });

  return NextResponse.json({
    ok: true,
    message:
      'Laporan sudah dikirim ke admin. Admin akan menghubungimu untuk tindak lanjut.',
  });
}