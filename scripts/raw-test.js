const { Client } = require('pg');

const client = new Client({ host: 'localhost', user: 'claude', password: 'claude', database: 'family_tree_test' });

async function buatPerson(nama, gender, urutan) {
  const r = await client.query('INSERT INTO person (nama, gender, urutan_kelahiran) VALUES ($1,$2,$3) RETURNING id', [nama, gender, urutan]);
  return r.rows[0].id;
}
async function relasi(parentId, childId) {
  await client.query('INSERT INTO parent_child (parent_id, child_id) VALUES ($1,$2)', [parentId, childId]);
}
async function getParentsOf(id) {
  const r = await client.query('SELECT parent_id FROM parent_child WHERE child_id = $1', [id]);
  return r.rows.map(row => row.parent_id);
}
async function getPerson(id) {
  const r = await client.query('SELECT * FROM person WHERE id = $1', [id]);
  return r.rows[0];
}
async function buildAncestorMap(startId) {
  const visited = new Map();
  visited.set(startId, { depth: 0, predecessor: null });
  let frontier = [startId];
  while (frontier.length > 0) {
    const next = [];
    for (const cur of frontier) {
      const { depth } = visited.get(cur);
      const parents = await getParentsOf(cur);
      for (const p of parents) {
        const ex = visited.get(p);
        if (!ex || ex.depth > depth + 1) {
          visited.set(p, { depth: depth + 1, predecessor: cur });
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return visited;
}
async function findLCA(p1, p2) {
  const anc1 = await buildAncestorMap(p1);
  const anc2 = await buildAncestorMap(p2);
  let best = null, bestTotal = Infinity;
  for (const [id, info1] of anc1) {
    const info2 = anc2.get(id);
    if (info2) {
      const total = info1.depth + info2.depth;
      if (total < bestTotal) { bestTotal = total; best = id; }
    }
  }
  if (!best) return null;
  return { lca: best, depth1: anc1.get(best).depth, depth2: anc2.get(best).depth, anc1, anc2 };
}
function cabangLangsungLCA(ancMap, lcaId, depth) {
  if (depth === 0) return null;
  return ancMap.get(lcaId).predecessor;
}
async function lookupIstilah(gap, arah, gender, posisi) {
  const r = await client.query('SELECT * FROM istilah_panggilan WHERE gap=$1 AND arah=$2', [gap, arah]);
  const rows = r.rows;
  const find = (g, p) => rows.find(c => c.gender === g && c.posisi === p);
  const hit = find(gender, posisi) || find(gender, null) || find(null, posisi) || find(null, null);
  return hit ? hit.istilah : null;
}
async function tentukanPanggilan(p1, p2) {
  if (p1 === p2) return 'diri sendiri';
  const hasil = await findLCA(p1, p2);
  if (!hasil) return 'tidak ada hubungan';
  const { lca, depth1, depth2, anc1, anc2 } = hasil;
  const person2 = await getPerson(p2);

  if (depth1 === 0 || depth2 === 0) {
    const gap = Math.abs(depth1 - depth2);
    const arah = depth1 < depth2 ? 'bawah' : 'atas';
    if (gap === 1) return arah === 'atas' ? (person2.gender === 'L' ? 'Bapak' : 'Ibu') : 'Anak';
    return lookupIstilah(gap, arah, null, null);
  }
  if (depth1 === depth2) {
    const b1 = cabangLangsungLCA(anc1, lca, depth1);
    const b2 = cabangLangsungLCA(anc2, lca, depth2);
    const u1 = (await getPerson(b1)).urutan_kelahiran;
    const u2 = (await getPerson(b2)).urutan_kelahiran;
    const posisi = u2 < u1 ? 'tua' : 'muda';
    return lookupIstilah(0, 'atas', person2.gender, posisi);
  }
  const gap = Math.abs(depth1 - depth2);
  const arah = depth1 > depth2 ? 'atas' : 'bawah';
  if (gap === 1) {
    const b1 = cabangLangsungLCA(anc1, lca, depth1);
    const b2 = cabangLangsungLCA(anc2, lca, depth2);
    const u1 = (await getPerson(b1)).urutan_kelahiran;
    const u2 = (await getPerson(b2)).urutan_kelahiran;
    const posisi = u2 < u1 ? 'tua' : 'muda';
    return lookupIstilah(1, arah, person2.gender, arah === 'atas' ? posisi : null);
  }
  return lookupIstilah(gap, arah, null, null);
}

async function main() {
  await client.connect();

  const Kakek = await buatPerson('Kakek', 'L', 1);
  const A = await buatPerson('A', 'L', 1);
  const B = await buatPerson('B', 'L', 2);
  const C = await buatPerson('C', 'L', 3);
  await relasi(Kakek, A); await relasi(Kakek, B); await relasi(Kakek, C);

  const AA = await buatPerson('AA', 'L', 1);
  const AB = await buatPerson('AB', 'L', 2);
  const AC = await buatPerson('AC', 'L', 3);
  await relasi(A, AA); await relasi(A, AB); await relasi(A, AC);

  const BA = await buatPerson('BA', 'L', 1);
  await relasi(B, BA);
  const BAA = await buatPerson('BAA', 'L', 1);
  await relasi(BA, BAA);

  const CA = await buatPerson('CA', 'L', 1);
  await relasi(C, CA);
  const CAA = await buatPerson('CAA', 'L', 1);
  await relasi(CA, CAA);
  const CAAB = await buatPerson('CAAB', 'L', 1);
  await relasi(CAA, CAAB);
  const CAABC = await buatPerson('CAABC', 'L', 1);
  await relasi(CAAB, CAABC);
  const CAC = await buatPerson('CAC', 'L', 1);
  await relasi(CA, CAC);

  const AAA = await buatPerson('AAA', 'L', 1);
  await relasi(AA, AAA);
  const AAC = await buatPerson('AAC', 'L', 2);
  await relasi(AA, AAC);
  const ABA = await buatPerson('ABA', 'L', 1);
  await relasi(AB, ABA);

  const cases = [
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

  console.log('=== HASIL VALIDASI ALGORITMA (raw pg, bypass Prisma) ===\n');
  let lolosSemua = true;
  for (const [label, p1, p2, expected] of cases) {
    const hasil = await tentukanPanggilan(p1, p2);
    const ok = hasil === expected;
    if (!ok) lolosSemua = false;
    console.log(`${ok ? 'LOLOS' : 'GAGAL'} | ${label.padEnd(12)} hasil="${hasil}" expected="${expected}"`);
  }
  console.log('\n' + (lolosSemua ? '>>> SEMUA 10 TEST CASE LOLOS <<<' : '>>> ADA YANG GAGAL <<<'));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
