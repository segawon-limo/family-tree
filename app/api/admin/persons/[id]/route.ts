import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireAdmin, isAdminFor } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// GET: semua member yang login boleh lihat detail person
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAuth(); } catch (e) { return e as Response; }
  const { id } = params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      parentsLink: { include: { parent: { select: { id: true, nama: true, gender: true } } } },
    },
  });
  if (!person) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 });

  type ParentLink = { parent: { id: string; nama: string; gender: string } };
  const links = person.parentsLink as ParentLink[];
  const bapak = links.find((pl) => pl.parent.gender === 'L')?.parent ?? null;
  const ibu = links.find((pl) => pl.parent.gender === 'P')?.parent ?? null;

  return NextResponse.json({
    id: person.id,
    nama: person.nama,
    gender: person.gender,
    urutanKelahiran: person.urutanKelahiran,
    tanggalLahir: person.tanggalLahir,
    tanggalWafat: person.tanggalWafat,
    catatan: person.catatan,
    bapakId: bapak?.id ?? null,
    ibuId: ibu?.id ?? null,
    // tipe diasumsikan sama utk bapak & ibu -- ambil dari salah satu kalau ada
    tipe: (person.parentsLink as any[])[0]?.tipe ?? 'kandung',
  });
}

// Cek apakah `calonOrtuId` adalah keturunan dari `personId` -- kalau
// ya, menjadikannya ortu akan bikin SIKLUS (orang jadi nenek moyang
// dirinya sendiri). Traversal turun (BFS via children), bukan naik.
async function adalahKeturunan(personId: string, calonOrtuId: string): Promise<boolean> {
  if (personId === calonOrtuId) return true;
  let frontier = [personId];
  const visited = new Set<string>(frontier);
  while (frontier.length > 0) {
    const childLinks = await prisma.parentChild.findMany({
      where: { parentId: { in: frontier } },
      select: { childId: true },
    });
    const nextFrontier = childLinks.map((c: { childId: string }) => c.childId).filter((cid: string) => !visited.has(cid));
    if (nextFrontier.includes(calonOrtuId)) return true;
    nextFrontier.forEach((cid: string) => visited.add(cid));
    frontier = nextFrontier;
  }
  return false;
}

// PUT: admin global ATAU admin cabang yang scope-nya mencakup person ini
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let session: Awaited<ReturnType<typeof requireAuth>>;
  try { session = await requireAuth(); } catch (e) { return e as Response; }
  const { id } = params;
  const allowed = session.role === 'admin' || await isAdminFor(session.sub, id);
  if (!allowed) {
    return NextResponse.json({ error: 'Akses ditolak: kamu bukan admin untuk node ini.' }, { status: 403 });
  }
  const body = await req.json();
  const { nama, gender, urutanKelahiran, tanggalLahir, tanggalWafat, bapakId, ibuId, tipe, catatan } = body;

  if (!nama || !gender || urutanKelahiran === undefined || urutanKelahiran === null) {
    return NextResponse.json(
      { error: 'Nama, gender, dan urutan kelahiran wajib diisi.' },
      { status: 400 }
    );
  }

  // Validasi dasar: tanggal wafat tidak boleh sebelum tanggal lahir.
  // Tidak mem-validasi "tidak boleh di masa depan" -- itu terlalu ketat
  // untuk skenario input data historis/typo yang nanti dikoreksi ulang.
  if (tanggalLahir && tanggalWafat && new Date(tanggalWafat) < new Date(tanggalLahir)) {
    return NextResponse.json(
      { error: 'Tanggal wafat tidak boleh sebelum tanggal lahir.' },
      { status: 400 }
    );
  }

  // --- Validasi anti-siklus ---
  for (const calonOrtuId of [bapakId, ibuId].filter(Boolean)) {
    if (calonOrtuId === id) {
      return NextResponse.json({ error: 'Tidak bisa menjadikan diri sendiri sebagai orang tua.' }, { status: 400 });
    }
    const siklus = await adalahKeturunan(id, calonOrtuId);
    if (siklus) {
      return NextResponse.json(
        {
          error:
            'Tidak bisa: orang yang dipilih sebagai bapak/ibu adalah KETURUNAN dari person ini. Ini akan membuat siklus di tree (orang jadi nenek moyang dirinya sendiri).',
        },
        { status: 409 }
      );
    }
  }

  // --- Validasi urutan_kelahiran unik per bapak, KECUALI diri sendiri ---
  if (bapakId) {
    const existing = await prisma.parentChild.findMany({
      where: { parentId: bapakId },
      include: { child: { select: { id: true, urutanKelahiran: true, deletedAt: true } } },
    });
    type Existing = { child: { id: string; urutanKelahiran: number; deletedAt: Date | null } };
    const dup = (existing as Existing[]).some(
      (e) =>
        e.child.id !== id &&
        e.child.deletedAt === null &&
        e.child.urutanKelahiran === Number(urutanKelahiran)
    );
    if (dup) {
      return NextResponse.json(
        { error: `Urutan kelahiran ${urutanKelahiran} sudah dipakai saudara lain dari bapak yang sama.` },
        { status: 409 }
      );
    }
  }

  try {
    await prisma.person.update({
      where: { id },
      data: {
        nama,
        gender,
        urutanKelahiran: Number(urutanKelahiran),
        tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
        tanggalWafat: tanggalWafat ? new Date(tanggalWafat) : null,
        catatan: catatan || null,
      },
    });

    // Relink ortu: hapus link lama, buat ulang
    await prisma.parentChild.deleteMany({ where: { childId: id } });
    const relasiTipe = tipe === 'angkat' ? 'angkat' : 'kandung';
    if (bapakId) {
      await prisma.parentChild.create({ data: { parentId: bapakId, childId: id, tipe: relasiTipe } });
    }
    if (ibuId) {
      await prisma.parentChild.create({ data: { parentId: ibuId, childId: id, tipe: relasiTipe } });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Gagal update.' }, { status: 500 });
  }
}

// DELETE: hanya super admin yang bisa hapus person (soft delete)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch (e) { return e as Response; }
  const { id } = params;

  // Cek dulu apakah person ini punya anak -- kalau ya, jangan hapus
  // tanpa peringatan, karena akan merusak struktur tree (anak jadi
  // "menggantung" tanpa salah satu ortu).
  const anak = await prisma.parentChild.findFirst({ where: { parentId: id } });
  if (anak) {
    return NextResponse.json(
      {
        error:
          'Person ini punya anak yang tercatat. Hapus/ubah relasi anak dulu sebelum hapus node ini, supaya tree tidak rusak.',
      },
      { status: 409 }
    );
  }

  await prisma.person.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}