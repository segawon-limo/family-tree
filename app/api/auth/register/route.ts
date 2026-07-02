import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// POST /api/auth/register
// Body menentukan action:
//   { action: 'validate-code', kode }
//   { action: 'search', query }  ← cari person by nama (untuk step 3)
//   { action: 'claim', personId, email, noHp }
//   { action: 'not-found', namaDicari, email, noHp, catatan }

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  switch (action) {
    case 'validate-code':
      return handleValidateCode(body);
    case 'search':
      return handleSearch(body);
    case 'claim':
      return handleClaim(body);
    case 'not-found':
      return handleNotFound(body);
    default:
      return NextResponse.json({ error: 'Action tidak dikenali.' }, { status: 400 });
  }
}

// ============================================================
// Step 1: validasi kode keluarga
// ============================================================
async function handleValidateCode(body: { kode?: string }) {
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
    return NextResponse.json(
      { error: 'Kode tidak valid atau sudah kedaluwarsa. Hubungi admin keluarga.' },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}

// ============================================================
// Step 3: cari person by nama (belum diklaim)
// Tampilkan bin/binti + catatan kalau tidak ada bapak
// ============================================================
async function handleSearch(body: { query?: string }) {
  const { query } = body;
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
}) {
  const { personId, email, noHp } = body;

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
}) {
  const { namaDicari, email, catatan, noHp } = body;
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