/**
 * lib/treeLayout.ts
 *
 * Layout sederhana (BUKAN library graph-layout canggih) khusus utk
 * tree silsilah ini. Asumsi: tidak ada siklus (sudah dijamin oleh
 * validasi anti-siklus di API edit), tipe data persis sama dgn yang
 * dikembalikan endpoint GET /api/admin/persons & /api/admin/spouse.
 *
 * KNOWN LIMITATION yang sengaja belum ditangani:
 * - Kalau seorang anak HANYA punya ibuId terisi (bapak tidak diketahui),
 *   dan ibunya itu sendiri seorang "married-in" (tidak punya ortu &
 *   bukan anchor), anak itu tidak akan muncul di layout -- karena
 *   pencarian posisi cuma menyusuri dari anchor root ke bawah lewat
 *   primaryParentId. Kasus ini belum ada di data nyata sejauh ini,
 *   tapi catat kalau nanti ada anak dgn ibu diketahui tapi bapak tidak,
 *   DAN ibunya sendiri tidak punya ortu tercatat.
 */

export type PersonRow = {
  id: string;
  nama: string;
  gender: string;
  urutanKelahiran: number;
  bapakId: string | null;
  ibuId: string | null;
  fotoUrl?: string | null;
};

export type SpouseRow = {
  person1Id: string;
  person2Id: string;
  status: string;
};

export type LayoutNode = {
  id: string;
  nama: string;
  gender: string;
  generation: number;
  x: number;
  isMarriedIn: boolean; // true = tidak punya data ortu, posisi nempel ke pasangan
  fotoUrl: string | null;
};

export type LayoutEdge = { fromId: string; toId: string };

export type LayoutResult = {
  nodes: LayoutNode[];
  parentEdges: LayoutEdge[];
  spouseEdges: LayoutEdge[];
  coupleMidX: Record<string, number>;
  maxGeneration: number;
  maxX: number;
};

function primaryParentId(p: PersonRow): string | null {
  return p.bapakId ?? p.ibuId ?? null;
}

export function computeLayout(persons: PersonRow[], spouses: SpouseRow[]): LayoutResult {
  const byId = new Map(persons.map((p) => [p.id, p]));

  // spouseMap: pasangan AKTIF diutamakan, fallback wafat, cerai diabaikan
  // (konsisten dgn keputusan getSpouseOf di lib/familyCalc.ts)
  // CATATAN: spouseMap ini SATU-ke-SATU (1 partner per id) dan dipakai
  // di SELURUH logika anchor/generasi/coupleMidX di bawah -- itu tetap
  // dipertahankan apa adanya karena redesign penuh ke struktur N-ke-N
  // di semua tempat itu scope yang jauh lebih besar dari yang dibutuhkan
  // sekarang. spouseMap di sini cuma menentukan SATU partner "utama"
  // (utk anchor-decision, coupleMidX, dll).
  const spouseMap = new Map<string, string>();
  const sorted = [...spouses].sort((a) => (a.status === 'menikah' ? -1 : 1));
  for (const s of sorted) {
    if (s.status === 'cerai') continue;
    if (!spouseMap.has(s.person1Id)) spouseMap.set(s.person1Id, s.person2Id);
    if (!spouseMap.has(s.person2Id)) spouseMap.set(s.person2Id, s.person1Id);
  }

  // allSpousesOf: BERBEDA dari spouseMap -- ini SEMUA pasangan tercatat
  // per orang (poligami berurutan: bisa >1, mis. istri pertama wafat lalu
  // menikah lagi -- lihat PROJECT_SUMMARY). Dipakai KHUSUS utk reservasi
  // lebar & penempatan posisi married-in supaya >1 pasangan TIDAK
  // tumpang-tindih di titik x yang sama (bug nyata yang ditemukan user:
  // Abu Nangin py 2 istri, keduanya dapat offset +0.87 yang SAMA dari
  // spouseMap lama). Urutan: 'menikah' (aktif) duluan, baru 'wafat'/lainnya,
  // supaya pasangan aktif konsisten ada di slot terdekat dgn anchor.
  const allSpousesOf = new Map<string, string[]>();
  for (const s of sorted) {
    if (s.status === 'cerai') continue;
    if (!allSpousesOf.has(s.person1Id)) allSpousesOf.set(s.person1Id, []);
    if (!allSpousesOf.get(s.person1Id)!.includes(s.person2Id)) allSpousesOf.get(s.person1Id)!.push(s.person2Id);
    if (!allSpousesOf.has(s.person2Id)) allSpousesOf.set(s.person2Id, []);
    if (!allSpousesOf.get(s.person2Id)!.includes(s.person1Id)) allSpousesOf.get(s.person2Id)!.push(s.person1Id);
  }

  const childrenMap = new Map<string, PersonRow[]>();
  for (const p of persons) {
    const pp = primaryParentId(p);
    if (pp) {
      if (!childrenMap.has(pp)) childrenMap.set(pp, []);
      childrenMap.get(pp)!.push(p);
    }
  }
  for (const [, kids] of childrenMap) kids.sort((a, b) => a.urutanKelahiran - b.urutanKelahiran);

  const noParent = persons.filter((p) => !primaryParentId(p));

  // Tentukan siapa yang jadi "anchor" vs "married-in" di antara yang
  // tidak punya data ortu sama sekali.
  //
  // PRINSIP UTAMA (fix dari bug sebelumnya): siapapun yang SUDAH PUNYA
  // ANAK tercatat (sbg primaryParentId anak tsb) WAJIB tetap jadi anchor,
  // apapun status data ortu pasangannya. Tanpa aturan ini, begitu
  // pasangan seseorang belakangan ditambahkan riwayat ortunya sendiri
  // (misal: menambah org tua istri utk bikin "tree lain" dari sisi
  // keluarga istri), suami yg sudah punya anak bisa ke-flag married-in
  // dan SELURUH KETURUNANNYA HILANG dari render (karena hanya anchor yg
  // ditelusuri assignX ke bawah). Ini bug nyata yang sempat ditemukan.
  const marriedInIds = new Set<string>();
  const decided = new Set<string>();
  const hasOwnChildren = (id: string) => (childrenMap.get(id)?.length ?? 0) > 0;

  for (const p of noParent) {
    if (decided.has(p.id)) continue;

    if (hasOwnChildren(p.id)) {
      // p WAJIB tetap anchor -- ada anak yg bergantung pada posisi ini.
      decided.add(p.id);
      continue;
    }

    const partnerId = spouseMap.get(p.id);
    const partner = partnerId ? byId.get(partnerId) : null;

    if (!partner) {
      decided.add(p.id); // anchor standalone, tidak punya pasangan tercatat
      continue;
    }

    if (hasOwnChildren(partner.id)) {
      // partner wajib anchor (punya anak) -> p otomatis married-in,
      // TIDAK PEDULI apakah partner sendiri punya data ortu atau tidak.
      marriedInIds.add(p.id);
      decided.add(p.id);
      decided.add(partner.id);
      continue;
    }

    const partnerHasParent = !!primaryParentId(partner);
    if (partnerHasParent) {
      // partner punya garis keturunan sendiri (akan dirender via subtree-nya
      // sendiri) -> p ini married-in, nempel ke posisi partner.
      marriedInIds.add(p.id);
      decided.add(p.id);
      decided.add(partner.id);
      continue;
    }

    if (!decided.has(partner.id)) {
      // dua-duanya tidak punya ortu tercatat & tidak punya anak sendiri --
      // pasangan "pendiri", pilih satu jadi anchor (default laki-laki).
      let anchor = p;
      let other = partner;
      if (p.gender !== 'L' && other.gender === 'L') {
        anchor = other;
        other = p;
      }
      marriedInIds.add(other.id);
      decided.add(p.id);
      decided.add(partner.id);
    }
  }

  const allAnchors = noParent.filter((p) => !marriedInIds.has(p.id));

  // FIX KESELARASAN GENERASI: anchor yang PASANGANNYA sudah/akan
  // diposisikan lewat leluhurnya sendiri (Siti, via Rukiyat) JANGAN
  // dimulai dari generasi 0 sendiri (Supardi) -- itu bikin 2 keluarga
  // jadi 2 klaster terpisah yg generasinya tidak sejajar (kelihatan
  // "kacau"). Anchor seperti itu harus DITUNDA, lalu disejajarkan ke
  // generasi pasangannya setelah pasangan itu selesai diposisikan.
  const deferredAnchors: PersonRow[] = [];
  const normalAnchors: PersonRow[] = [];
  for (const a of allAnchors) {
    const partnerId = spouseMap.get(a.id);
    const partner = partnerId ? byId.get(partnerId) : null;
    const partnerHasOwnAncestry = partner ? !!primaryParentId(partner) : false;
    if (partnerHasOwnAncestry) {
      deferredAnchors.push(a);
    } else {
      normalAnchors.push(a);
    }
  }
  normalAnchors.sort((a, b) => a.urutanKelahiran - b.urutanKelahiran);

  const deferredAnchorIds = new Set(deferredAnchors.map((a) => a.id));

  // ===== PASS 1: hitung lebar subtree (read-only, belum assign posisi) =====
  // Ini kunci restrukturisasi: lebar subtree milik DEFERRED ANCHOR (misal
  // Supardi) dihitung & "dipesan" SEBAGAI BAGIAN dari lebar slot pasangannya
  // (Siti) -- SEBELUM Rukiyat's children dialokasikan. Tanpa ini, ruang utk
  // Supardi baru dicari SETELAH semua saudara Siti selesai dialokasikan,
  // jadi dia kepental jauh ke ujung antrian (bug yg ditemukan user).
  const widthCache = new Map<string, number>();
  function subtreeWidth(id: string, visiting: Set<string> = new Set()): number {
    if (widthCache.has(id)) return widthCache.get(id)!;
    if (visiting.has(id)) return 1; // jaga2 thd siklus data yg tidak terduga
    visiting.add(id);

    const kids = childrenMap.get(id) ?? [];
    let width = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + subtreeWidth(k.id, visiting), 0);

    const partnerId = spouseMap.get(id);
    if (partnerId) {
      if (marriedInIds.has(partnerId)) {
        // Reservasi sebanyak JUMLAH pasangan married-in yg nempel ke id ini
        // (poligami: bisa >1), bukan selalu 1. Lihat allSpousesOf di atas.
        const marriedInCount = (allSpousesOf.get(id) ?? []).filter((sid) => marriedInIds.has(sid)).length;
        width += Math.max(1, marriedInCount);
      } else if (deferredAnchorIds.has(partnerId)) {
        // reservasi PENUH lebar subtree pasangan yg blood-nya berasal dari
        // sisi lain (Supardi) -- ini yg sebelumnya tidak ada, sebabnya gap jauh
        width += subtreeWidth(partnerId, visiting) + 1;
      }
    }

    visiting.delete(id);
    widthCache.set(id, width);
    return width;
  }

  const generation = new Map<string, number>();
  const xPos = new Map<string, number>();
  const parentEdges: LayoutEdge[] = [];
  let counter = 0;

  function assignX(p: PersonRow, gen: number): number {
    generation.set(p.id, gen);
    const kids = childrenMap.get(p.id) ?? [];
    let x: number;
    if (kids.length === 0) {
      // FIX UTAMA: konsumsi lebar PENUH (termasuk reservasi pasangan,
      // baik married-in sederhana maupun deferred-anchor) -- bukan
      // selalu 1 unit polos seperti sebelumnya.
      const w = subtreeWidth(p.id);
      x = counter;
      counter += w;
    } else {
      const childXs = kids.map((k) => {
        parentEdges.push({ fromId: p.id, toId: k.id });
        return assignX(k, gen + 1);
      });
      x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    }
    xPos.set(p.id, x);

    // Reservasi tambahan utk kasus NON-LEAF p yg punya pasangan --
    // (leaf sudah otomatis ter-cover lewat subtreeWidth di atas, tapi
    // p non-leaf x-nya hasil rata-rata, bukan dari counter, jadi perlu
    // dicek manual spy tidak overlap dgn sibling SETELAHNYA)
    const partnerId = spouseMap.get(p.id);
    if (partnerId) {
      if (marriedInIds.has(partnerId)) {
        const marriedInCount = (allSpousesOf.get(p.id) ?? []).filter((sid) => marriedInIds.has(sid)).length;
        counter = Math.max(counter, x + 1 + Math.max(1, marriedInCount));
      } else if (deferredAnchorIds.has(partnerId)) {
        counter = Math.max(counter, x + 0.87 + subtreeWidth(partnerId));
      }
    }

    return x;
  }

  for (const a of normalAnchors) {
    assignX(a, 0);
    counter += 1; // jarak antar subtree akar yang berbeda
  }

  // Proses anchor yang ditunda: sejajarkan generasinya ke generasi
  // pasangan (sudah diketahui sekarang), DAN mulai alokasi posisi-nya
  // TEPAT di slot yang sudah direservasi sejak PASS 1 -- bukan lagi
  // "wherever global counter happens to land".
  for (const a of deferredAnchors) {
    const partnerId = spouseMap.get(a.id)!;
    const startGen = generation.get(partnerId) ?? 0;
    const partnerX = xPos.get(partnerId);
    const savedCounter = counter;
    if (partnerX !== undefined) {
      counter = partnerX + 0.87; // mulai PERSIS di slot yg sudah dipesan
    }
    assignX(a, startGen);
    // jaga2: kembalikan counter ke posisi global terjauh, supaya kalau
    // ada deferred anchor lain setelah ini, tidak overlap balik ke
    // wilayah yg sudah dipakai subtree lain.
    counter = Math.max(counter, savedCounter) + 1;
  }

  // Posisikan married-in tepat di sebelah pasangannya.
  // Offset 0.87 kolom (bukan 0.55 versi awal) -- dgn CARD_W=150 & COL_W=190
  // di tree/page.tsx, 0.55 menyebabkan kartu OVERLAP ~45px (sudah terbukti
  // di screenshot user). 0.87 kolom = beri jarak antar tepi kartu ~16px.
  //
  // POLIGAMI FIX: kalau satu anchor punya >1 pasangan married-in (mis.
  // istri pertama wafat, menikah lagi -- lihat PROJECT_SUMMARY), SEMUA
  // pasangan itu sebelumnya dapat offset +0.87 yang SAMA dari spouseMap
  // (1 partner per id), jadi tumpang-tindih persis di titik x yang sama.
  // Bug nyata, ditemukan dari screenshot user (Abu Nangin, 2 istri).
  // Fix: kelompokkan per anchor via allSpousesOf, urutkan (menikah/aktif
  // duluan -- sudah terjamin lewat urutan `sorted` di atas), lalu beri
  // offset BERTAMBAH (0.87, 1.74, 2.61, ...) per pasangan married-in.
  const MARRIED_IN_OFFSET = 0.87;
  const spouseEdges: LayoutEdge[] = [];
  const positionedMarriedIn = new Set<string>();
  for (const [anchorId, partnerIds] of allSpousesOf) {
    if (marriedInIds.has(anchorId)) continue; // anchorId di sini harus non-married-in
    if (!generation.has(anchorId)) continue; // anchor belum punya posisi (data tidak lengkap)

    const marriedInPartners = partnerIds.filter((pid) => marriedInIds.has(pid) && !positionedMarriedIn.has(pid));
    marriedInPartners.forEach((pid, idx) => {
      generation.set(pid, generation.get(anchorId)!);
      xPos.set(pid, xPos.get(anchorId)! + MARRIED_IN_OFFSET * (idx + 1));
      spouseEdges.push({ fromId: anchorId, toId: pid });
      positionedMarriedIn.add(pid);
    });
  }
  // Jaring pengaman: married-in yg anchornya somehow tidak muncul di
  // allSpousesOf iteration di atas (seharusnya tidak terjadi, tapi jaga2
  // drpd kartu hilang total dari render kalau ada data edge-case).
  for (const id of marriedInIds) {
    if (positionedMarriedIn.has(id)) continue;
    const partnerId = spouseMap.get(id);
    if (!partnerId || !generation.has(partnerId)) continue;
    generation.set(id, generation.get(partnerId)!);
    xPos.set(id, xPos.get(partnerId)! + MARRIED_IN_OFFSET);
    spouseEdges.push({ fromId: partnerId, toId: id });
    positionedMarriedIn.add(id);
  }

  // Spouse edge utk pasangan yang KEDUANYA sudah punya posisi lewat
  // jalur darah (bukan married-in) -- misal kasus "tree lain": Siti
  // Rukayah belakangan dapat data ortu sendiri, jadi dia DAN Supardi
  // sama2 anchor di subtree masing-masing. Garis tetap digambar, TAPI
  // catat: kalau generasi/x mereka jauh beda (subtree berbeda), garis
  // ini akan terlihat panjang/diagonal -- itu BUKAN bug, itu konsekuensi
  // jujur dari dua orang yg posisinya ditentukan oleh 2 garis keturunan
  // independen. Belum ada solusi "gabungkan tampilan" utk kasus ini.
  for (const [a, b] of spouseMap) {
    if (!marriedInIds.has(a) && !marriedInIds.has(b) && generation.has(a) && generation.has(b)) {
      const already = spouseEdges.some(
        (e) => (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a)
      );
      if (!already) spouseEdges.push({ fromId: a, toId: b });
    }
  }

  // coupleMidX: titik x tengah antara dua pasangan yang SAMA GENERASI --
  // dipakai renderer sbg titik awal garis cabang ke anak (bukan dari
  // posisi salah satu individu saja). Hanya dihitung kalau generasi sama
  // (kalau beda generasi/subtree independen, titik tengah tidak valid
  // secara visual -- renderer fallback ke x masing2 utk kasus itu).
  const coupleMidX: Record<string, number> = {};
  for (const e of spouseEdges) {
    const genA = generation.get(e.fromId);
    const genB = generation.get(e.toId);
    if (genA !== undefined && genA === genB) {
      const mid = (xPos.get(e.fromId)! + xPos.get(e.toId)!) / 2;
      coupleMidX[e.fromId] = mid;
      coupleMidX[e.toId] = mid;
    }
  }

  // isMarriedIn UTK TAMPILAN (dashed/solid) -- ini SENGAJA dipisah dari
  // marriedInIds (yang dipakai di atas utk hitung POSISI x/generasi).
  // marriedInIds = "orang ini diposisikan dgn cara nempel ke pasangan,
  //   bukan recursive assignX sendiri" -- tetap berbasis "punya anak
  //   sendiri atau tidak", supaya keturunan tidak hilang dari render.
  // displayMarriedIn = "tampilkan border dashed" -- berbasis PER-PASANGAN:
  //   kalau pasangan A punya leluhur tercatat dan pasangan B tidak, B
  //   ditandai dashed, BERAPAPUN jumlah anak B sendiri. Ini murni visual,
  //   tidak mengubah posisi siapapun.
  function displayMarriedIn(p: PersonRow): boolean {
    if (marriedInIds.has(p.id)) return true;
    const partnerId = spouseMap.get(p.id);
    const partner = partnerId ? byId.get(partnerId) : null;
    if (!partner) return false;
    const pHasAncestry = !!primaryParentId(p);
    const partnerHasAncestry = !!primaryParentId(partner);
    return !pHasAncestry && partnerHasAncestry;
  }

  const nodes: LayoutNode[] = persons
    .filter((p) => generation.has(p.id))
    .map((p) => ({
      id: p.id,
      nama: p.nama,
      gender: p.gender,
      generation: generation.get(p.id)!,
      x: xPos.get(p.id)!,
      isMarriedIn: displayMarriedIn(p),
      fotoUrl: p.fotoUrl ?? null,
    }));

  const maxGeneration = nodes.reduce((m, n) => Math.max(m, n.generation), 0);
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);

  return { nodes, parentEdges, spouseEdges, coupleMidX, maxGeneration, maxX };
}