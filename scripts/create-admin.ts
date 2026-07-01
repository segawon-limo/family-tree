/**
 * scripts/create-admin.ts
 *
 * Buat akun admin pertama (super admin) SEBELUM JWT aktif mengunci
 * semua routes. Jalankan SEKALI saja, sebelum `npm run dev` pertama
 * kali dengan auth aktif.
 *
 * Cara pakai:
 *   npx tsx scripts/create-admin.ts
 *
 * Script ini akan prompt email & password di terminal.
 * Password minimal 8 karakter. Jangan hardcode credential di sini.
 *
 * Kalau butuh ganti password admin nanti, jalankan ulang script ini
 * dengan email yang sama -- dia akan UPDATE bukan buat duplikat.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('=== Buat Akun Admin Pertama ===\n');

  const email = await prompt('Email admin: ');
  if (!email || !email.includes('@')) {
    console.error('Email tidak valid.');
    process.exit(1);
  }

  const password = await prompt('Password (min 8 karakter): ');
  if (!password || password.length < 8) {
    console.error('Password terlalu pendek (min 8 karakter).');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    // Update password kalau sudah ada -- berguna kalau lupa password
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash: hash, role: 'admin' },
    });
    console.log(`\nPassword untuk ${email} berhasil diperbarui.`);
  } else {
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hash,
        role: 'admin',
      },
    });
    console.log(`\nAkun admin berhasil dibuat: ${email}`);
  }
  console.log('Sekarang bisa login di /login dengan credential ini.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());