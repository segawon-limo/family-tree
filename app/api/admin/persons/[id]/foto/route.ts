import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { requireAuth, isAdminFor } from '@/lib/auth';

// WAJIB: rute ini pakai requireAuth()/getSession() yang baca cookies().
// Tanpa baris ini, Next.js mencoba PRERENDER rute ini saat `next build`,
// dan pola `catch (e) { return e as Response }` di bawah ikut menelan
// sinyal internal Next.js yang seharusnya bilang "rute ini dynamic,
// jangan di-prerender" -- akibatnya build gagal dengan error "No response
// is returned from route handler". Ditemukan dari build error nyata,
// bukan pencegahan spekulatif -- JANGAN dihapus.
export const dynamic = 'force-dynamic';

// Folder fisik penyimpanan foto -- DI LUAR `public/`, sengaja. Lihat
// catatan di db_migrations/migrations/011_person_foto.sql kenapa.
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'foto-profil');

// Validasi tipe file dari MAGIC BYTES, bukan dari extension/mimetype
// yang dikirim browser -- mimetype gampang dipalsukan (rename .exe jadi
// .jpg dan set Content-Type manual lewat fetch/curl). Ini bukan paranoid
// berlebihan: endpoint upload tanpa validasi isi file adalah salah satu
// vektor serangan paling umum (upload file berbahaya berkedok gambar).
const MAGIC_BYTES: { ext: string; bytes: number[] }[] = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header, cek lanjutan WEBP di offset 8 di bawah
];

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB -- cukup utk foto profil, cegah upload file besar sembarangan

function detectExt(buf: Buffer): string | null {
  for (const m of MAGIC_BYTES) {
    if (m.bytes.every((b, i) => buf[i] === b)) {
      if (m.ext === 'webp') {
        // RIFF....WEBP -- cek 4 byte di offset 8
        const webpMarker = buf.subarray(8, 12).toString('ascii');
        if (webpMarker !== 'WEBP') continue;
      }
      return m.ext;
    }
  }
  return null;
}

// POST: upload/ganti foto profil person. multipart/form-data, field "foto".
// SEBELUMNYA TIDAK ADA PENGECEKAN AUTH SAMA SEKALI DI SINI -- siapapun,
// termasuk yang belum login, bisa upload foto ke person manapun kalau
// tahu id-nya. Ditemukan tidak sengaja saat menambahkan GET handler di
// file yang sama, bukan laporan terpisah. Sekarang wajib admin (global
// atau scoped ke node ini), konsisten dengan endpoint admin/persons lain.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let session;
  try { session = await requireAuth(); } catch (e) { return e as Response; }
  const allowed = session.role === 'admin' || (await isAdminFor(session.sub, id));
  if (!allowed) {
    return NextResponse.json({ error: 'Akses ditolak: kamu bukan admin untuk node ini.' }, { status: 403 });
  }
  const person = await prisma.person.findUnique({ where: { id }, select: { id: true, fotoPath: true } });
  if (!person) return NextResponse.json({ error: 'Person tidak ditemukan' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('foto');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Field "foto" wajib diisi (file).' }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: `File maksimal ${MAX_SIZE_BYTES / 1024 / 1024}MB.` }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = detectExt(buf);
  if (!ext) {
    return NextResponse.json(
      { error: 'Tipe file tidak didukung. Hanya JPG, PNG, atau WEBP (dicek dari isi file, bukan nama file).' },
      { status: 415 }
    );
  }

  await mkdir(STORAGE_DIR, { recursive: true });

  // Nama file = personId, BUKAN nama file asli dari user -- mencegah
  // path traversal (mis. nama file "../../../etc/passwd") dan mencegah
  // collision antar upload. Foto lama (ekstensi lain) dihapus dulu kalau
  // ada, supaya tidak ada file orphan menumpuk di disk tiap ganti foto.
  if (person.fotoPath) {
    await unlink(path.join(STORAGE_DIR, person.fotoPath)).catch(() => {
      // foto lama mungkin sudah tidak ada di disk -- bukan error fatal, lanjut saja
    });
  }

  const filename = `${id}.${ext}`;
  await writeFile(path.join(STORAGE_DIR, filename), buf);

  await prisma.person.update({ where: { id }, data: { fotoPath: filename } });

  return NextResponse.json({ ok: true, fotoPath: filename });
}

// DELETE: hapus foto profil (kembali ke tanpa foto / placeholder).
// Sama seperti POST -- sebelumnya tidak ada auth check sama sekali.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let session;
  try { session = await requireAuth(); } catch (e) { return e as Response; }
  const allowed = session.role === 'admin' || (await isAdminFor(session.sub, id));
  if (!allowed) {
    return NextResponse.json({ error: 'Akses ditolak: kamu bukan admin untuk node ini.' }, { status: 403 });
  }

  const person = await prisma.person.findUnique({ where: { id }, select: { fotoPath: true } });
  if (!person) return NextResponse.json({ error: 'Person tidak ditemukan' }, { status: 404 });

  if (person.fotoPath) {
    await unlink(path.join(STORAGE_DIR, person.fotoPath)).catch(() => {});
    await prisma.person.update({ where: { id }, data: { fotoPath: null } });
  }

  return NextResponse.json({ ok: true });
}

// GET: sajikan file foto profil. SEBELUMNYA TIDAK ADA SAMA SEKALI --
// akibatnya fitur foto profil upload-nya jalan tapi tidak pernah bisa
// ditampilkan di manapun (tree hover preview, halaman profil, dst).
// Dibuka untuk SEMUA member login (bukan admin-only) -- ini cuma foto
// profil yang memang ditujukan utk dilihat seluruh keluarga, konsisten
// dengan akses data person lain yang juga readable oleh semua member.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
  } catch (e) {
    return e as Response;
  }

  const { id } = params;
  const person = await prisma.person.findUnique({ where: { id }, select: { fotoPath: true } });
  if (!person?.fotoPath) {
    return NextResponse.json({ error: 'Tidak ada foto.' }, { status: 404 });
  }

  try {
    const buf = await readFile(path.join(STORAGE_DIR, person.fotoPath));
    const ext = person.fotoPath.split('.').pop();
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        // private (bukan public) -- ini bukan aset publik, harus lewat
        // auth check di atas tiap kali browser cache-nya expire.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    // File di DB ada tapi tidak ketemu di disk (mis. terhapus manual /
    // storage di-reset tanpa update DB) -- 404 biasa, bukan 500, supaya
    // frontend bisa fallback ke avatar inisial dengan tenang.
    return NextResponse.json({ error: 'File foto tidak ditemukan di disk.' }, { status: 404 });
  }
}