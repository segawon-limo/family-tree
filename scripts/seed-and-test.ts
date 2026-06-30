/**
 * scripts/seed-and-test.ts
 *
 * Replikasi tree contoh yang dipakai sepanjang diskusi (Kakek -> A,B,C
 * -> AA,AB,AC / BA,BB / CA,CB,CC, plus generasi lebih dalam) dan
 * jalankan SEMUA 9+ test case yang sudah disepakati manual, untuk
 * verifikasi algoritma BENAR sebelum dipakai di data keluarga asli.
 *
 * Jalankan: npx tsx scripts/seed-and-test.ts
 * (Pakai database terpisah/sementara -- JANGAN jalankan ke DB produksi)
 */

import { PrismaClient } from '@prisma/client';
import { tentukanPanggilan } from '../lib/familyCalc';

const prisma = new PrismaClient();

async function buatPerson(nama: string, gender: 'L' | 'P', urutan: number) {
  return prisma.person.create({ data: { nama, gender, urutanKelahiran: urutan } });
}

async function main() {
  // --- Seed istilah_panggilan (sama dengan migration 006) ---
  const istilahSeed = [
    { gap: 0, arah: 'atas', gender: 'L', posisi: 'tua', istilah: 'mas' },
    { gap: 0, arah: 'atas', gender: 'P', posisi: 'tua', istilah: 'mbak' },
    { gap: 0, arah: 'atas', gender: null, posisi: 'muda', istilah: 'dik' },
    { gap: 1, arah: 'atas', gender: 'L', posisi: 'tua', istilah: 'pakde' },
    { gap: 1, arah: 'atas', gender: 'L', posisi: 'muda', istilah: 'paklik' },
    { gap: 1, arah: 'atas', gender: 'P', posisi: 'tua', istilah: 'bude' },
    { gap: 1, arah: 'atas', gender: 'P', posisi: 'muda', istilah: 'bulik' },
    { gap: 1, arah: 'bawah', gender: null, posisi: null, istilah: 'dik' },
    { gap: 2, arah: 'atas', gender: null, posisi: null, istilah: 'mbah' },
    { gap: 2, arah: 'bawah', gender: null, posisi: null, istilah: 'cucu' },
    { gap: 3, arah: 'atas', gender: null, posisi: null, istilah: 'mbah buyut' },
    { gap: 3, arah: 'bawah', gender: null, posisi: null, istilah: 'buyut' },
    { gap: 4, arah: 'atas', gender: null, posisi: null, istilah: 'mbah canggah' },
    { gap: 4, arah: 'bawah', gender: null, posisi: null, istilah: 'canggah' },
  ] as const;
  for (const i of istilahSeed) await prisma.istilahPanggilan.create({ data: i });

  // --- Bangun tree sesuai contoh diskusi ---
  const kakek = await buatPerson('Kakek', 'L', 1);
  const A = await buatPerson('A', 'L', 1);
  const B = await buatPerson('B', 'L', 2);
  const C = await buatPerson('C', 'L', 3);
  for (const anak of [A, B, C]) {
    await prisma.parentChild.create({ data: { parentId: kakek.id, childId: anak.id } });
  }

  const AA = await buatPerson('AA', 'L', 1);
  const AB = await buatPerson('AB', 'L', 2);
  const AC = await buatPerson('AC', 'L', 3);
  for (const anak of [AA, AB, AC]) {
    await prisma.parentChild.create({ data: { parentId: A.id, childId: anak.id } });
  }

  const BA = await buatPerson('BA', 'L', 1);
  const BB = await buatPerson('BB', 'L', 2);
  for (const anak of [BA, BB]) {
    await prisma.parentChild.create({ data: { parentId: B.id, childId: anak.id } });
  }
  const BAA = await buatPerson('BAA', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: BA.id, childId: BAA.id } });

  const CA = await buatPerson('CA', 'L', 1);
  const CB = await buatPerson('CB', 'L', 2);
  const CC = await buatPerson('CC', 'L', 3);
  for (const anak of [CA, CB, CC]) {
    await prisma.parentChild.create({ data: { parentId: C.id, childId: anak.id } });
  }

  // generasi lebih dalam, sesuai test case gap>=2
  const AAA = await buatPerson('AAA', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: AA.id, childId: AAA.id } });

  const ABA = await buatPerson('ABA', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: AB.id, childId: ABA.id } });

  const CAA = await buatPerson('CAA', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: CA.id, childId: CAA.id } });

  const CAAB = await buatPerson('CAAB', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: CAA.id, childId: CAAB.id } });

  const CAABC = await buatPerson('CAABC', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: CAAB.id, childId: CAABC.id } });

  const CAC = await buatPerson('CAC', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: CA.id, childId: CAC.id } });

  const AAC = await buatPerson('AAC', 'L', 1);
  await prisma.parentChild.create({ data: { parentId: AA.id, childId: AAC.id } });

  // --- Jalankan semua test case yang sudah disepakati manual ---
  const cases: [string, { id: string; nama: string }, { id: string; nama: string }, string][] = [
    ['AAA->CA', AAA, CA, 'paklik'],
    ['CA->AAA', CA, AAA, 'dik'],
    ['CA->A', CA, A, 'pakde'],
    ['CAC->BA', CAC, BA, 'pakde'],
    ['AAC->CA', AAC, CA, 'paklik'],
    ['CAA->C', CAA, C, 'mbah'],
    ['BAA->C', BAA, C, 'mbah'],
    ['CAAB->C', CAAB, C, 'mbah buyut'],
    ['CAABC->C', CAABC, C, 'mbah canggah'],
    ['CAAB->B', CAAB, B, 'mbah buyut'],
  ];

  console.log('=== HASIL VALIDASI ===');
  let semuaLolos = true;
  for (const [label, p1, p2, expected] of cases) {
    const hasil = await tentukanPanggilan(prisma, p1.id, p2.id);
    const lolos = hasil === expected;
    if (!lolos) semuaLolos = false;
    console.log(`${lolos ? '✅' : '❌'} ${label}: hasil="${hasil}" expected="${expected}"`);
  }
  console.log(semuaLolos ? '\nSEMUA TEST LOLOS' : '\nADA TEST YANG GAGAL -- cek logika sebelum lanjut!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
