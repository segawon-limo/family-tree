/**
 * lib/familyCalc.ts
 *
 * Implementasi nyata dari pseudocode yang sudah diuji manual ke
 * 9+ test case selama diskusi (AAA-CA, AAA-ABA, CAC-BA, AAC-CA,
 * CAA-C, BAA-C, CAAB-C, CAABC-C, CAAB-B, CA-A).
 *
 * CATATAN PENTING -- KNOWN LIMITATION yang belum dibahas eksplisit
 * dengan user: kalau person1 ATAU person2 adalah leluhur/keturunan
 * LANGSUNG satu sama lain (depth1===0 atau depth2===0, contoh:
 * orang tua ke anak kandung sendiri, depth=1), istilah yang tepat
 * BUKAN paklik/bulik (itu untuk saudara ortu, bukan ortu sendiri).
 * Kode ini menangani kasus itu secara terpisah (lihat handleDirectLine),
 * tapi belum divalidasi ke user -- jangan anggap final tanpa dicek.
 */

import { PrismaClient } from '@prisma/client';

type AncestorInfo = { depth: number; predecessor: string | null };
type AncestorMap = Map<string, AncestorInfo>;

// ------------------------------------------------------------
// BFS naik dari satu person ke semua leluhurnya (lewat parent_child,
// tipe kandung ATAU angkat -- sesuai keputusan "anak angkat = sama").
// predecessor[X] = node satu langkah lebih dekat ke start, dipakai
// untuk rekonstruksi "cabang langsung LCA" nanti.
// ------------------------------------------------------------
async function getParentsOf(prisma: PrismaClient, personId: string): Promise<string[]> {
  const rows = await prisma.parentChild.findMany({
    where: { childId: personId },
    select: { parentId: true },
  });
  return rows.map((r: { parentId: string }) => r.parentId);
}

async function buildAncestorMap(prisma: PrismaClient, startId: string): Promise<AncestorMap> {
  const visited: AncestorMap = new Map();
  visited.set(startId, { depth: 0, predecessor: null });
  let frontier: string[] = [startId];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      const { depth } = visited.get(current)!;
      const parents = await getParentsOf(prisma, current);
      for (const p of parents) {
        const existing = visited.get(p);
        if (!existing || existing.depth > depth + 1) {
          visited.set(p, { depth: depth + 1, predecessor: current });
          nextFrontier.push(p);
        }
      }
    }
    frontier = nextFrontier;
  }
  return visited;
}

// ------------------------------------------------------------
// Cari LCA dengan total depth minimum.
// Catatan: kalau ada pernikahan sepupu (multi-LCA dgn depth sama),
// fungsi ini ambil salah satu secara arbitrary (Map iteration order)
// -- user sudah konfirmasi kasus ini tidak terjadi di keluarganya.
// ------------------------------------------------------------
async function findLCA(prisma: PrismaClient, person1Id: string, person2Id: string) {
  const anc1 = await buildAncestorMap(prisma, person1Id);
  const anc2 = await buildAncestorMap(prisma, person2Id);

  let bestLCA: string | null = null;
  let bestTotal = Infinity;

  for (const [id, info1] of anc1) {
    const info2 = anc2.get(id);
    if (info2) {
      const total = info1.depth + info2.depth;
      if (total < bestTotal) {
        bestTotal = total;
        bestLCA = id;
      }
    }
  }

  if (!bestLCA) return null;
  return {
    lca: bestLCA,
    depth1: anc1.get(bestLCA)!.depth,
    depth2: anc2.get(bestLCA)!.depth,
    anc1,
    anc2,
  };
}

// "Cabang langsung LCA" pada jalur menuju start -- inilah titik yang
// dibandingkan urutan_kelahiran-nya utk tie-break tua/muda (gap=0 & gap=1).
// null jika start ITU SENDIRI adalah LCA (depth 0 -- direct line).
function cabangLangsungLCA(ancMap: AncestorMap, lcaId: string, depthDariStart: number): string | null {
  if (depthDariStart === 0) return null;
  return ancMap.get(lcaId)!.predecessor;
}

async function getPerson(prisma: PrismaClient, id: string) {
  return prisma.person.findUniqueOrThrow({ where: { id } });
}

async function lookupIstilah(
  prisma: PrismaClient,
  gap: number,
  arah: 'atas' | 'bawah',
  gender: string | null,
  posisi: 'tua' | 'muda' | null
): Promise<string> {
  type IstilahRow = { gender: string | null; posisi: string | null; istilah: string };
  const candidates: IstilahRow[] = await prisma.istilahPanggilan.findMany({ where: { gap, arah } });
  const tryFind = (g: string | null, p: string | null) =>
    candidates.find((c: IstilahRow) => c.gender === g && c.posisi === p);

  const exact = tryFind(gender, posisi) ?? tryFind(gender, null) ?? tryFind(null, posisi) ?? tryFind(null, null);
  if (!exact) {
    throw new Error(
      `Istilah tidak ditemukan utk gap=${gap} arah=${arah}. Kemungkinan gap>4 belum divalidasi ke sesepuh -- lihat README.`
    );
  }
  return exact.istilah;
}

// ------------------------------------------------------------
// Direct line (ancestor langsung -- depth1 atau depth2 == 0).
// BUKAN paklik/bulik. Ini known-limitation yang belum divalidasi
// user secara eksplisit -- placeholder konservatif.
// ------------------------------------------------------------
async function handleDirectLine(
  prisma: PrismaClient,
  gap: number,
  arah: 'atas' | 'bawah',
  person2Gender: string
): Promise<string> {
  if (gap === 1) {
    return arah === 'atas' ? (person2Gender === 'L' ? 'Bapak' : 'Ibu') : 'Anak';
  }
  // gap>=2 direct line (kakek-cucu kandung, dst) -- pakai tabel flat,
  // sudah terkonfirmasi sama dengan versi collateral (gap>=2 flat).
  return lookupIstilah(prisma, gap, arah, null, null);
}

export type RelasiDarahResult =
  | { tipe: 'diri_sendiri' }
  | { tipe: 'tidak_ada_hubungan' }
  | { tipe: 'istilah'; istilah: string };

async function hitungRelasiDarah(
  prisma: PrismaClient,
  person1Id: string,
  person2Id: string
): Promise<RelasiDarahResult> {
  if (person1Id === person2Id) return { tipe: 'diri_sendiri' };

  const hasil = await findLCA(prisma, person1Id, person2Id);
  if (!hasil) return { tipe: 'tidak_ada_hubungan' };

  const { lca, depth1, depth2, anc1, anc2 } = hasil;
  const person2 = await getPerson(prisma, person2Id);

  // Direct line: salah satu adalah leluhur langsung yang lain
  if (depth1 === 0 || depth2 === 0) {
    const gap = Math.abs(depth1 - depth2);
    const arah: 'atas' | 'bawah' = depth1 < depth2 ? 'bawah' : 'atas';
    const istilah = await handleDirectLine(prisma, gap, arah, person2.gender);
    return { tipe: 'istilah', istilah };
  }

  if (depth1 === depth2) {
    // gap=0: bandingkan cabang langsung LCA
    const branch1 = cabangLangsungLCA(anc1, lca, depth1)!;
    const branch2 = cabangLangsungLCA(anc2, lca, depth2)!;
    const u1 = (await getPerson(prisma, branch1)).urutanKelahiran;
    const u2 = (await getPerson(prisma, branch2)).urutanKelahiran;
    const posisi: 'tua' | 'muda' = u2 < u1 ? 'tua' : 'muda';
    const istilah = await lookupIstilah(prisma, 0, 'atas', person2.gender, posisi);
    return { tipe: 'istilah', istilah };
  }

  const gap = Math.abs(depth1 - depth2);
  const arah: 'atas' | 'bawah' = depth1 > depth2 ? 'atas' : 'bawah';

  if (gap === 1) {
    // gap=1: SAMA seperti gap=0, bandingkan cabang langsung LCA
    // (bukan depth-1, ini bug yang sudah diperbaiki dari versi awal)
    const branch1 = cabangLangsungLCA(anc1, lca, depth1)!;
    const branch2 = cabangLangsungLCA(anc2, lca, depth2)!;
    const u1 = (await getPerson(prisma, branch1)).urutanKelahiran;
    const u2 = (await getPerson(prisma, branch2)).urutanKelahiran;
    const posisi: 'tua' | 'muda' = u2 < u1 ? 'tua' : 'muda';
    const istilah = await lookupIstilah(prisma, 1, arah, person2.gender, arah === 'atas' ? posisi : null);
    return { tipe: 'istilah', istilah };
  }

  // gap>=2: flat, tidak peduli gender/posisi
  const istilah = await lookupIstilah(prisma, gap, arah, null, null);
  return { tipe: 'istilah', istilah };
}

// ------------------------------------------------------------
// Layer spouse: ipar ikut posisi pasangannya, tanpa istilah
// terpisah, berlaku di SEMUA gap (sudah dikonfirmasi user).
// ------------------------------------------------------------
async function getSpouseOf(prisma: PrismaClient, personId: string): Promise<string | null> {
  const rows = await prisma.spouse.findMany({
    where: { OR: [{ person1Id: personId }, { person2Id: personId }] },
  });
  if (rows.length === 0) return null;

  type SpouseRow = { person1Id: string; person2Id: string; status: string; createdAt: Date };
  const typed = rows as SpouseRow[];

  // Prioritas: pernikahan AKTIF ('menikah') diutamakan -- ini penting
  // utk kasus menikah lagi setelah pasangan wafat (dikonfirmasi user
  // terjadi di keluarga ini). Fallback ke 'wafat' kalau tidak ada yang
  // aktif. 'cerai' DIABAIKAN -- ASUMSI: setelah cerai, kekerabatan lewat
  // pernikahan itu tidak lagi berlaku. Ini asumsi budaya yang belum
  // dikonfirmasi user secara eksplisit, tandai sebagai TODO validasi.
  const aktif = typed.find((r) => r.status === 'menikah');
  const fallbackWafat = typed.find((r) => r.status === 'wafat');
  const pilihan = aktif ?? fallbackWafat;
  if (!pilihan) return null;

  return pilihan.person1Id === personId ? pilihan.person2Id : pilihan.person1Id;
}

/**
 * Tentukan bagaimana person1 memanggil person2.
 * Urutan pengecekan: darah/angkat langsung -> lewat spouse person2 -> lewat spouse person1.
 */
export async function tentukanPanggilan(
  prisma: PrismaClient,
  person1Id: string,
  person2Id: string
): Promise<string> {
  if (person1Id === person2Id) return 'diri sendiri';

  // Cek dulu: apakah person2 itu PASANGAN LANGSUNG person1 sendiri?
  // Ini KASUS YANG SEBELUMNYA TIDAK TERTANGANI SAMA SEKALI -- kode lama
  // cuma mencari relasi darah, lalu spouse-of-person2, lalu spouse-of-
  // person1, tapi tidak pernah cek "person2 ADALAH spouse person1".
  // Akibatnya suami/istri sendiri selalu jatuh ke fallback "tidak ada
  // hubungan keluarga tercatat" -- ditemukan dari bug report nyata.
  const spouseOfSelf = await getSpouseOf(prisma, person1Id);
  if (spouseOfSelf === person2Id) {
    const person2 = await getPerson(prisma, person2Id);
    return person2.gender === 'L' ? 'suami' : 'istri';
  }

  const langsung = await hitungRelasiDarah(prisma, person1Id, person2Id);
  if (langsung.tipe === 'diri_sendiri') return 'diri sendiri';
  if (langsung.tipe === 'istilah') return langsung.istilah;

  // tidak ada relasi darah -> coba lewat spouse person2 (person2 adalah ipar/istri-suami)
  const spouseOf2 = await getSpouseOf(prisma, person2Id);
  if (spouseOf2) {
    const viaSpouse = await hitungRelasiDarah(prisma, person1Id, spouseOf2);
    if (viaSpouse.tipe === 'istilah') {
      // istilah ikut versi gender person2 -- karena lookupIstilah sudah
      // dipanggil dgn gender pasangan lama, kita re-lookup dgn gender person2
      // catatan: pendekatan ini cukup utk gap0/gap1 (gender-dependent),
      // utk gap>=2 hasilnya identik krn flat.
      return await reLookupDenganGenderBaru(prisma, person1Id, spouseOf2, person2Id);
    }
  }

  // person1 sendiri yang masuk lewat pernikahan -> ikut cara pasangannya memanggil
  const spouseOf1 = await getSpouseOf(prisma, person1Id);
  if (spouseOf1) {
    const viaSpouse1 = await hitungRelasiDarah(prisma, spouseOf1, person2Id);
    if (viaSpouse1.tipe === 'istilah') return viaSpouse1.istilah;
  }

  return 'tidak ada hubungan keluarga tercatat';
}

// Helper: re-hitung gap/arah/posisi antara person1 & spouseOf2 (darah),
// lalu lookup ulang istilah pakai gender person2 yang asli (bukan gender spouseOf2).
async function reLookupDenganGenderBaru(
  prisma: PrismaClient,
  person1Id: string,
  spouseOf2Id: string,
  person2Id: string
): Promise<string> {
  const hasil = await findLCA(prisma, person1Id, spouseOf2Id);
  const person2 = await getPerson(prisma, person2Id);
  if (!hasil) return 'tidak ada hubungan keluarga tercatat';

  const { lca, depth1, depth2, anc1, anc2 } = hasil;

  if (depth1 === 0 || depth2 === 0) {
    const gap = Math.abs(depth1 - depth2);
    const arah: 'atas' | 'bawah' = depth1 < depth2 ? 'bawah' : 'atas';
    return handleDirectLine(prisma, gap, arah, person2.gender);
  }

  if (depth1 === depth2) {
    const branch1 = cabangLangsungLCA(anc1, lca, depth1)!;
    const branch2 = cabangLangsungLCA(anc2, lca, depth2)!;
    const u1 = (await getPerson(prisma, branch1)).urutanKelahiran;
    const u2 = (await getPerson(prisma, branch2)).urutanKelahiran;
    const posisi: 'tua' | 'muda' = u2 < u1 ? 'tua' : 'muda';
    return lookupIstilah(prisma, 0, 'atas', person2.gender, posisi);
  }

  const gap = Math.abs(depth1 - depth2);
  const arah: 'atas' | 'bawah' = depth1 > depth2 ? 'atas' : 'bawah';

  if (gap === 1) {
    const branch1 = cabangLangsungLCA(anc1, lca, depth1)!;
    const branch2 = cabangLangsungLCA(anc2, lca, depth2)!;
    const u1 = (await getPerson(prisma, branch1)).urutanKelahiran;
    const u2 = (await getPerson(prisma, branch2)).urutanKelahiran;
    const posisi: 'tua' | 'muda' = u2 < u1 ? 'tua' : 'muda';
    return lookupIstilah(prisma, 1, arah, person2.gender, arah === 'atas' ? posisi : null);
  }

  return lookupIstilah(prisma, gap, arah, null, null);
}