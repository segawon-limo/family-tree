import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

// GET: validasi token (dipakai saat halaman reset-password load)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token tidak ada.' }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record) {
    return NextResponse.json({ error: 'Link tidak valid.' }, { status: 404 });
  }
  if (record.usedAt) {
    return NextResponse.json({ error: 'Link ini sudah pernah dipakai.' }, { status: 410 });
  }
  if (record.expiredAt < new Date()) {
    return NextResponse.json({ error: 'Link sudah kedaluwarsa. Hubungi admin untuk minta link baru.' }, { status: 410 });
  }

  const person = await prisma.person.findUnique({
    where: { id: record.personId },
    select: { nama: true },
  });

  return NextResponse.json({ ok: true, nama: person?.nama ?? '' });
}

// POST: set password baru setelah validasi token
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: 'Token dan password wajib diisi.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiredAt < new Date()) {
    return NextResponse.json(
      { error: 'Link tidak valid, sudah dipakai, atau sudah kedaluwarsa.' },
      { status: 410 }
    );
  }

  const hash = await bcrypt.hash(password, 12);

  // Beda dari setup-password: userId langsung dari record.userId, tidak
  // perlu muter lewat klaimRequest.userId -- makanya PasswordResetToken
  // sengaja dibuat terhubung langsung ke userId dari awal.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: hash },
    }),
    prisma.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}