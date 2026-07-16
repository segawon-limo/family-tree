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

// GET: semua member yang login boleh lihat daftar person (dipakai search
// di register & kalkulator panggilan -- HARUS tetap unrestricted untuk
// mereka, termasuk kalau yang login kebetulan admin/sub-admin).
//
// Query param ?forAdminManagement=1 -- SENGAJA opt-in eksplisit, BUKAN
// otomatis dari role -- supaya scoping cuma berlaku saat dipanggil dari
// halaman /admin (manajemen data), bukan dari /register atau /panggilan
// yang butuh lihat SEMUA orang termasuk kalau viewer-nya sub-admin.
// Kalau param ini tidak dikirim, behavior 100% sama seperti sebelumnya.
export async function GET(req: NextRequest) {
  const forAdminManagement = req.nextUrl.searchParams.get('forAdminManagement') === '1';

  let scopedIds: string[] | null = null;
  if (forAdminManagement) {
    try { await requireAdmin(); } catch (e) { return e as Response; }
    const session = await requireAuth(); // aman dipanggil 2x, requireAdmin sudah lolos
    scopedIds = await getScopedPersonIds(session.sub);
  } else {
    try { await requireAuth(); } catch (e) { return e as Response; }
  }

  const persons = await prisma.person.findMany({
    where: {
      deletedAt: null,
      // scopedIds === null berarti UNRESTRICTED (super admin, atau bukan
      // request admin-management sama sekali) -- JANGAN tambahkan filter id
      // sama sekali dalam kasus ini. scopedIds sebagai array (termasuk
      // array kosong) berarti FILTER ke id itu persis.
      ...(scopedIds !== null ? { id: { in: scopedIds } } : {}),
    },
    include: {
      parentsLink: {
        include: { parent: { select: { id: true, nama: true, gender: true } } },
      },
      userAccount: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  type PersonWithParents = {
    id: string;
    nama: string;
    gender: string;
    urutanKelahiran: number;
    tanggalLahir: Date | null;
    catatan: string | null;
    fotoPath: string | null;
    parentsLink: { parent: { id: string; nama: string; gender: string } }[];
    userAccount: { id: string } | null;
  };

  const shaped = (persons as PersonWithParents[]).map((p) => {
    const bapak = p.parentsLink.find((pl) => pl.parent.gender === 'L')?.parent ?? null;
    const ibu = p.parentsLink.find((pl) => pl.parent.gender === 'P')?.parent ?? null;
    return {
      id: p.id,
      nama: p.nama,
      gender: p.gender,
      urutanKelahiran: p.urutanKelahiran,
      tanggalLahir: p.tanggalLahir,
      catatan: p.catatan,
      // BARU: sebelumnya field ini tidak pernah dikirim ke client sama
      // sekali, padahal endpoint foto (GET /api/admin/persons/[id]/foto,
      // baru ditambahkan) sudah bisa menyajikan filenya -- akibatnya foto
      // profil TIDAK PERNAH tampil di manapun (tree hover preview, dst),
      // selalu jatuh ke avatar inisial. Ditemukan saat membangun halaman
      // profil person, bukan laporan terpisah -- root cause sama.
      fotoUrl: p.fotoPath ? `/api/admin/persons/${p.id}/foto` : null,
      bapakId: bapak?.id ?? null,
      bapakNama: bapak?.nama ?? null,
      ibuId: ibu?.id ?? null,
      ibuNama: ibu?.nama ?? null,
      // Ditambahkan untuk tombol "Generate link reset password" di admin --
      // dulu tidak ada cara buat client tahu siapa yang sudah punya akun.
      // Catatan: ini expose ke SEMUA member login (endpoint ini shared,
      // bukan admin-only), bukan cuma admin -- info "siapa sudah klaim"
      // levelnya rendah, sudah semi-terlihat dari border putus-putus di
      // tree, jadi tidak menambah exposure baru yang berarti.
      hasAccount: !!p.userAccount,
      // Dibutuhkan form "kelola sub-admin" -- id User yang terhubung (bukan
      // cuma boolean hasAccount) supaya bisa langsung dipakai sebagai
      // userId di POST /api/admin/scopes tanpa endpoint users terpisah.
      userId: p.userAccount?.id ?? null,
    };
  });

  return NextResponse.json(shaped);
}

// POST: hanya admin yang boleh tambah person baru
export async function POST(req: NextRequest) {
  let session;
  try { session = await requireAdmin(); } catch (e) { return e as Response; }
  const body = await req.json();
  const { nama, gender, urutanKelahiran, tanggalLahir, tanggalWafat, bapakId, ibuId, tipe, catatan } = body;

  if (!nama || !gender || urutanKelahiran === undefined || urutanKelahiran === null) {
    return NextResponse.json(
      { error: 'Nama, gender, dan urutan kelahiran wajib diisi.' },
      { status: 400 }
    );
  }
  if (gender !== 'L' && gender !== 'P') {
    return NextResponse.json({ error: 'Gender harus L atau P.' }, { status: 400 });
  }
  if (tanggalLahir && tanggalWafat && new Date(tanggalWafat) < new Date(tanggalLahir)) {
    return NextResponse.json(
      { error: 'Tanggal wafat tidak boleh sebelum tanggal lahir.' },
      { status: 400 }
    );
  }

  // Admin dengan scope terbatas cuma boleh nambah person yang terhubung ke
  // cabangnya sendiri -- minimal salah satu dari bapakId/ibuId harus ada
  // di dalam scope. Sengaja "salah satu", bukan "keduanya", karena pasangan
  // yang "menikah masuk" (lihat catatan tree UI) wajar berasal dari luar
  // scope -- itu bukan pelanggaran, itu memang bagaimana keluarga bekerja.
  const scopedIds = await getScopedPersonIds(session.sub);
  if (scopedIds !== null) {
    const bapakInScope = bapakId && scopedIds.includes(bapakId);
    const ibuInScope = ibuId && scopedIds.includes(ibuId);
    if (!bapakInScope && !ibuInScope) {
      return NextResponse.json(
        { error: 'Kamu cuma bisa menambahkan anggota yang terhubung ke cabang keluarga yang jadi tanggung jawabmu.' },
        { status: 403 }
      );
    }
  }

  if (bapakId) {
    const existing = await prisma.parentChild.findMany({
      where: { parentId: bapakId },
      include: { child: { select: { urutanKelahiran: true, deletedAt: true } } },
    });
    const dup = existing.some(
      (e: { child: { deletedAt: Date | null; urutanKelahiran: number } }) =>
        e.child.deletedAt === null && e.child.urutanKelahiran === Number(urutanKelahiran)
    );
    if (dup) {
      return NextResponse.json(
        {
          error: `Urutan kelahiran ${urutanKelahiran} sudah dipakai anak lain dari bapak yang sama. Cek lagi urutannya.`,
        },
        { status: 409 }
      );
    }
  }

  try {
    const person = await prisma.person.create({
      data: {
        nama,
        gender,
        urutanKelahiran: Number(urutanKelahiran),
        tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
        tanggalWafat: tanggalWafat ? new Date(tanggalWafat) : null,
        catatan: catatan || null,
      },
    });

    const relasiTipe = tipe === 'angkat' ? 'angkat' : 'kandung';
    if (bapakId) {
      await prisma.parentChild.create({
        data: { parentId: bapakId, childId: person.id, tipe: relasiTipe },
      });
    }
    if (ibuId) {
      await prisma.parentChild.create({
        data: { parentId: ibuId, childId: person.id, tipe: relasiTipe },
      });
    }

    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    // tangkap juga kalau trigger DB yang akhirnya menolak (jaring pengaman kedua)
    return NextResponse.json(
      { error: err?.message ?? 'Gagal membuat person.' },
      { status: 500 }
    );
  }
}