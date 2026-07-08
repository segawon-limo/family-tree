import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';

// Serve foto lewat personId, BUKAN lewat nama file mentah di URL --
// supaya endpoint ini punya satu titik tunggal untuk gating akses.
//
// STATUS AUTH (diperbarui, komentar sebelumnya keliru): endpoint ini
// SUDAH butuh login (middleware.ts default-deny, path ini tidak ada di
// PUBLIC_PATHS). Yang BELUM ada: pembatasan "siapa boleh lihat foto
// siapa" -- siapapun yang sudah login bisa lihat foto anggota LAIN,
// bukan cuma admin/diri sendiri. Untuk foto profil keluarga yang memang
// ditujukan buat dilihat sesama anggota, ini kemungkinan acceptable --
// beda kasus dengan endpoint UPLOAD (lihat route foto POST/DELETE di
// app/api/admin/persons/[id]/foto/route.ts) yang harus dibatasi ketat
// karena itu operasi tulis, bukan cuma baca.
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