import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireAdmin, getScopedPersonIds } from '@/lib/auth';
// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// Sama seperti persons GET: dipakai /tree (semua member, unrestricted)
// DAN /admin (manajemen, harus scoped). ?forAdminManagement=1 opt-in
// eksplisit supaya /tree tidak ikut kena filter buat sub-admin.
export async function GET(req: NextRequest) {
  const forAdminManagement = req.nextUrl.searchParams.get('forAdminManagement') === '1';

  let scopedIds: string[] | null = null;
  if (forAdminManagement) {
    try { await requireAdmin(); } catch (e) { return e as Response; }
    const session = await requireAuth();
    scopedIds = await getScopedPersonIds(session.sub);
  } else {
    try { await requireAuth(); } catch (e) { return e as Response; }
  }

  const spouses = await prisma.spouse.findMany({
    where: scopedIds !== null
      ? { OR: [{ person1Id: { in: scopedIds } }, { person2Id: { in: scopedIds } }] }
      : undefined,
    include: {
      person1: { select: { nama: true } },
      person2: { select: { nama: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(spouses);
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }
  const { person1Id, person2Id, status, tanggalNikah } = await req.json();
  const finalStatus = status || 'menikah';

  if (!person1Id || !person2Id) {
    return NextResponse.json({ error: 'Kedua pasangan wajib dipilih.' }, { status: 400 });
  }
  if (person1Id === person2Id) {
    return NextResponse.json({ error: 'Tidak bisa pasangan dengan diri sendiri.' }, { status: 400 });
  }

  // Sama seperti persons POST: minimal SALAH SATU pasangan harus ada di
  // scope admin ini -- pasangan yang "menikah masuk" dari luar cabang itu
  // wajar, bukan pelanggaran.
  const scopedIds = await getScopedPersonIds(session.sub);
  if (scopedIds !== null) {
    const p1InScope = scopedIds.includes(person1Id);
    const p2InScope = scopedIds.includes(person2Id);
    if (!p1InScope && !p2InScope) {
      return NextResponse.json(
        { error: 'Kamu cuma bisa mencatat relasi pasangan yang terhubung ke cabang keluarga yang jadi tanggung jawabmu.' },
        { status: 403 }
      );
    }
  }

  // Validasi: tidak boleh ada 2 pernikahan status 'menikah' (aktif)
  // bersamaan untuk orang yang sama -- sesuai konfirmasi user bahwa
  // poligami simultan tidak terjadi di keluarga ini. Pernikahan
  // berurutan (setelah cerai/wafat) tetap diperbolehkan, makanya
  // cek ini HANYA berlaku kalau status baru = 'menikah'.
  if (finalStatus === 'menikah') {
    for (const pid of [person1Id, person2Id]) {
      const existingActive = await prisma.spouse.findFirst({
        where: {
          status: 'menikah',
          OR: [{ person1Id: pid }, { person2Id: pid }],
        },
        include: { person1: { select: { nama: true } }, person2: { select: { nama: true } } },
      });
      if (existingActive) {
        const nama = (await prisma.person.findUnique({ where: { id: pid }, select: { nama: true } }))?.nama;
        return NextResponse.json(
          {
            error: `${nama} sudah punya pernikahan aktif tercatat. Ubah status pernikahan lama jadi 'cerai'/'wafat' dulu kalau ini pernikahan baru (sesuai keputusan: tidak ada poligami simultan).`,
          },
          { status: 409 }
        );
      }
    }
  }

  try {
    const spouse = await prisma.spouse.create({
      data: {
        person1Id,
        person2Id,
        status: finalStatus,
        tanggalNikah: tanggalNikah ? new Date(tanggalNikah) : null,
      },
    });
    return NextResponse.json(spouse, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Gagal menyimpan relasi pasangan.' }, { status: 500 });
  }
}