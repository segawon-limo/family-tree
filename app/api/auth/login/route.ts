import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signToken, buildSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email dan password wajib diisi.' }, { status: 400 });
  }

  // Selalu lakukan bcrypt compare meski user tidak ditemukan -- ini mencegah
  // "timing attack" yang bisa membedakan "email tidak ada" vs "password salah"
  // dari waktu respons. Dummy hash dipakai kalau user tidak ketemu.
  const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvuDummyHashForTimingAttackPrevention';

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, passwordHash: true, role: true, personId: true },
  });

  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatch) {
    // Pesan generik -- JANGAN bedakan "email tidak ada" vs "password salah"
    return NextResponse.json(
      { error: 'Email atau password tidak sesuai.' },
      { status: 401 }
    );
  }

  const token = await signToken({
    sub: user.id,
    role: user.role as 'admin' | 'member',
    personId: user.personId,
  });

  const res = NextResponse.json({ ok: true, role: user.role });
  res.headers.set('Set-Cookie', buildSessionCookie(token));
  return res;
}