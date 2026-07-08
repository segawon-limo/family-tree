import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { tentukanPanggilan } from '@/lib/familyCalc';

// GET /api/panggilan/[fromId]
// Hitung panggilan dari fromId ke SEMUA person lain sekaligus, di server,
// satu kali request. SENGAJA tidak dipanggil per-node per-hover dari
// frontend -- tentukanPanggilan() melakukan BFS dgn N+1 query Prisma di
// dalamnya (lihat catatan di familyCalc.ts), jadi memanggilnya ratusan
// kali per hover akan terasa lag begitu jumlah anggota tree bertambah.
// Trade-off di sini: satu request agak berat (N person x BFS), tapi
// cuma sekali tiap kali "viewer" dipilih/berganti, hasilnya di-cache
// di state React di frontend.
//
// CATATAN -- diperbarui setelah verifikasi middleware.ts:
// Endpoint ini SUDAH dilindungi (butuh cookie sesi valid) lewat default-deny
// di middleware.ts -- '/api/panggilan' tidak ada di PUBLIC_PATHS, jadi
// request tanpa login akan kena 401 sebelum sampai ke handler ini.
// Yang BELUM benar: fromId di sini datang dari PILIHAN BEBAS user (dropdown
// di /tree, atau parameter apapun yang dikirim client), BUKAN dipaksa sama
// dengan personId di sesi (middleware sudah nyisipin x-user-person-id ke
// header request, tapi handler ini belum baca itu). Konsekuensinya: siapa
// pun yang SUDAH login (member biasa, bukan cuma admin) bisa lihat "siapa
// manggil siapa apa" dari sudut pandang ORANG LAIN, bukan cuma dirinya
// sendiri. Untuk app keluarga tertutup ini mungkin acceptable (bukan bug
// yang expose ke publik luar), tapi tetap beda dari "endpoint terbuka
// tanpa auth" yang ditulis di versi komentar sebelumnya -- itu keliru.
export async function GET(req: NextRequest, { params }: { params: { fromId: string } }) {
  const { fromId } = params;

  const viewer = await prisma.person.findUnique({ where: { id: fromId }, select: { id: true } });
  if (!viewer) {
    return NextResponse.json({ error: 'Person (viewer) tidak ditemukan' }, { status: 404 });
  }

  const allPersons = await prisma.person.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const result: Record<string, string> = {};
  for (const p of allPersons) {
    if (p.id === fromId) {
      result[p.id] = 'diri sendiri';
      continue;
    }
    try {
      result[p.id] = await tentukanPanggilan(prisma, fromId, p.id);
    } catch (err: any) {
      // PENTING: jangan tampilkan pesan generik yang sama utk semua jenis
      // error -- itu menyembunyikan bug asli (mis. LCA/depth salah hitung)
      // di balik pesan "gap>=5 belum divalidasi" yang menyesatkan kalau
      // penyebabnya sebenarnya beda. Tampilkan pesan error ASLI di sini
      // selama masih tahap development/debug. Kalau nanti errornya memang
      // konsisten cuma soal gap>=5 (lihat familyCalc.ts), boleh dirapikan
      // jadi pesan generik lagi -- tapi pastikan dulu lewat log ini.
      console.error(`[panggilan] gagal hitung ${fromId} -> ${p.id}:`, err?.message ?? err);
      result[p.id] = `(error: ${err?.message ?? 'unknown'})`;
    }
  }

  return NextResponse.json(result);
}