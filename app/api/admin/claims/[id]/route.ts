import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, isAdminFor, getScopedPersonIds } from '@/lib/auth';
import crypto from 'crypto';

// POST /api/admin/claims/[id]
// Body: { type: 'klaim' | 'inquiry', action: 'approve' | 'reject' | 'resolve', catatan? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let session: Awaited<ReturnType<typeof requireAdmin>>;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }

  const { id } = params;
  const body = await req.json();
  const { type, action, catatan } = body;

  if (type === 'inquiry') {
    return handleInquiry(id, session.sub);
  }
  if (type === 'klaim') {
    return handleKlaim(id, action, session.sub, catatan);
  }
  return NextResponse.json({ error: 'Type tidak dikenali.' }, { status: 400 });
}

async function handleInquiry(id: string, adminId: string) {
  // Konsisten dengan GET /api/admin/claims: inquiry (nama tidak ketemu di
  // tree) tidak punya personId, jadi tidak bisa diatribusikan ke cabang
  // manapun -- sengaja dibatasi cuma super admin (unrestricted), bukan
  // sub-admin manapun, walau dia entah bagaimana tahu id-nya.
  const scopedIds = await getScopedPersonIds(adminId);
  if (scopedIds !== null) {
    return NextResponse.json(
      { error: 'Cuma admin utama yang bisa menangani permintaan ini.' },
      { status: 403 }
    );
  }

  const inquiry = await prisma.registerInquiry.findUnique({ where: { id } });
  if (!inquiry) return NextResponse.json({ error: 'Tidak ditemukan.' }, { status: 404 });

  await prisma.registerInquiry.update({
    where: { id },
    data: { status: 'resolved', resolvedById: adminId, resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

async function handleKlaim(
  id: string,
  action: string,
  adminId: string,
  catatan?: string
) {
  const klaim = await prisma.klaimRequest.findUnique({
    where: { id },
    include: { person: true, user: true },
  });
  if (!klaim) return NextResponse.json({ error: 'Klaim tidak ditemukan.' }, { status: 404 });
  if (klaim.status !== 'pending') {
    return NextResponse.json(
      { error: `Klaim ini sudah ${klaim.status}, tidak bisa diubah lagi.` },
      { status: 409 }
    );
  }

  if (!(await isAdminFor(adminId, klaim.personId))) {
    return NextResponse.json(
      { error: 'Klaim ini di luar cabang keluarga yang jadi tanggung jawabmu.' },
      { status: 403 }
    );
  }

  if (action === 'reject') {
    // Kembalikan status person ke unclaimed
    // Hapus placeholder user yang dibuat saat klaim (karena tidak ada password-nya)
    await prisma.$transaction([
      prisma.klaimRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedById: adminId,
          reviewedAt: new Date(),
          catatanPenolakan: catatan || null,
        },
      }),
      prisma.person.update({
        where: { id: klaim.personId },
        data: { statusKlaim: 'unclaimed' },
      }),
      // Hapus placeholder user hanya kalau passwordHash masih __PENDING_SETUP__
      // (belum sempat set password -- yang ini berarti klaim ditolak sebelum
      // user sempat setup, jadi aman dihapus. Kalau sudah ada password,
      // user memang sudah aktif dan jangan dihapus.)
      ...(klaim.user.passwordHash === '__PENDING_SETUP__'
        ? [prisma.user.delete({ where: { id: klaim.userId } })]
        : []),
    ]);
    return NextResponse.json({ ok: true, action: 'rejected' });
  }

  if (action === 'approve') {
    // Generate token setup-password, valid 7 hari, sekali pakai
    const token = crypto.randomBytes(48).toString('hex');
    const expiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.klaimRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      }),
      prisma.person.update({
        where: { id: klaim.personId },
        data: { statusKlaim: 'claimed', userAccount: { connect: { id: klaim.userId } } },
      }),
      prisma.passwordSetupToken.create({
        data: {
          klaimRequestId: id,
          personId: klaim.personId,
          token,
          expiredAt,
        },
      }),
    ]);

    // Buat link yang siap dikopi ke WA oleh admin
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const setupLink = `${baseUrl}/setup-password?token=${token}`;

    return NextResponse.json({
      ok: true,
      action: 'approved',
      // Data yang dibutuhkan admin untuk kirim WA manual:
      namaUser: klaim.person.nama,
      emailUser: klaim.email,
      noHpUser: klaim.noHp,
      setupLink,
      linkExpiry: expiredAt.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
      }),
      // Pesan WA yang sudah diformat, tinggal kopi-paste
      pesanWA: `Halo ${klaim.person.nama}, klaim akun silsilah keluargamu sudah disetujui! Silakan buat password di link berikut (berlaku sampai ${expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}): ${setupLink}`,
    });
  }

  return NextResponse.json({ error: 'Action tidak dikenali.' }, { status: 400 });
}