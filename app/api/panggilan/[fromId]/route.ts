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
// CATATAN PENTING -- bukan keputusan auth yang sebenarnya:
// fromId di sini didapat dari PILIHAN MANUAL user di dropdown "lihat
// dari sudut pandang siapa" di halaman /tree, BUKAN dari sesi login
// (JWT middleware belum ada -- lihat backlog #4). Begitu auth asli
// jalan, fromId idealnya diambil dari session.personId yang sudah
// terverifikasi, bukan dari input bebas seperti sekarang. Endpoint ini
// sendiri juga belum ada auth check sama sekali, sama seperti endpoint
// admin lain.
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