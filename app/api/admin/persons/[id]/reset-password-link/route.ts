import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { requireAuth, isAdminFor } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// POST /api/admin/persons/[id]/reset-password-link
// Generate link reset password untuk person yang SUDAH punya akun (User
// terhubung). Link dikirim MANUAL oleh admin lewat WA -- TIDAK ada
// pengiriman email otomatis (app belum punya domain terverifikasi).
//
// PENTING: pakai isAdminFor(), BUKAN requireAdmin() polos -- requireAdmin()
// cuma cek role === 'admin', tidak peduli scope. Admin cabang (AdminScope
// terbatas ke subtree tertentu) tidak boleh generate reset link untuk
// person di luar scope-nya. Kalau route ini pakai requireAdmin() polos,
// itu privilege escalation buat admin cabang ke luar wilayahnya.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let session;
  try {
    session = await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const allowed = await isAdminFor(session.sub, id);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Kamu tidak punya akses admin untuk anggota ini.' },
      { status: 403 }
    );
  }

  const person = await prisma.person.findUnique({
    where: { id },
    select: { id: true, nama: true, userAccount: { select: { id: true } } },
  });

  if (!person) {
    return NextResponse.json({ error: 'Person tidak ditemukan.' }, { status: 404 });
  }
  if (!person.userAccount) {
    return NextResponse.json(
      { error: 'Anggota ini belum punya akun (belum pernah klaim+disetujui) -- tidak ada password untuk direset.' },
      { status: 400 }
    );
  }

  const token = crypto.randomBytes(48).toString('hex');
  // Expiry lebih pendek dari setup-password (7 hari) -- reset link idealnya
  // dipakai segera, dan kalau nyasar/ke-forward, jendela eksploitasinya
  // lebih sempit.
  const expiredAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    // Invalidasi token reset lama yang belum dipakai untuk user ini --
    // supaya tidak ada beberapa link valid nganggur bersamaan kalau admin
    // generate ulang (misal link pertama ilang/kelupaan terkirim).
    prisma.passwordResetToken.updateMany({
      where: { userId: person.userAccount.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: person.userAccount.id,
        personId: person.id,
        token,
        expiredAt,
      },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const resetLink = `${baseUrl}/reset-password?token=${token}`;

  return NextResponse.json({
    ok: true,
    namaUser: person.nama,
    resetLink,
    linkExpiry: expiredAt.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    pesanWA: `Halo ${person.nama}, ini link buat reset password akun silsilah keluarga kamu: ${resetLink}\n\nLink berlaku sampai ${expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}. Jangan dibagikan ke orang lain ya.`,
  });
}