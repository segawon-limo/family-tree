import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';

// Serve foto lewat personId, BUKAN lewat nama file mentah di URL --
// supaya endpoint ini punya satu titik tunggal di mana JWT middleware
// (backlog #4) nanti bisa nempel cek "apakah user ini boleh lihat foto
// person ini" sebelum baca file. Kalau langsung serve dari /public,
// tidak ada titik untuk gating itu sama sekali.
//
// BELUM ADA AUTH CHECK DI SINI -- ini TODO yang sama persis dengan
// semua endpoint admin lain (lihat catatan keamanan project_summary).
// Jangan anggap foto "kurang sensitif jadi aman diabaikan" -- foto
// wajah anggota keluarga tetap data pribadi.
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'foto-profil');

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const person = await prisma.person.findUnique({ where: { id }, select: { fotoPath: true } });
  if (!person?.fotoPath) {
    return NextResponse.json({ error: 'Tidak ada foto' }, { status: 404 });
  }

  const ext = person.fotoPath.split('.').pop() ?? '';
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  try {
    const buf = await readFile(path.join(STORAGE_DIR, person.fotoPath));
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        // cache pendek -- foto bisa diganti admin, jangan cache kelamaan di browser
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File foto tidak ditemukan di disk' }, { status: 404 });
  }
}