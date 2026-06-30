# Family Tree DB — Skema Final

Urutan eksekusi: jalankan file di folder `migrations/` sesuai urutan nomor (001 → 008).

## Struktur

| File | Tabel | Fungsi |
|---|---|---|
| 001 | `users` | Akun login |
| 002 | `person` | Node tree (skeleton, bisa diisi admin/ortu) |
| 003 | `parent_child` | Relasi darah/angkat + trigger validasi urutan_kelahiran |
| 004 | `spouse` | Relasi pernikahan (bukan darah, tidak ikut LCA) |
| 005 | `person_kontak` | Data sensitif, self-report, semua kolom optional |
| 006 | `istilah_panggilan` | Lookup istilah panggilan (data, bukan hardcode) |
| 007 | `kode_keluarga`, `klaim_request`, `admin_scope` | Akses & klaim node |
| 008 | `audit_log` | Jejak akses data sensitif |
| 009 | `password_setup_token` | Token set-password setelah klaim disetujui (link dikirim manual via WA) |

## Tech stack final (hasil diskusi)

- **Framework**: Next.js (App Router) — API routes sebagai backend, UI di frontend, satu codebase.
- **Database**: Postgres 16 yang sudah jalan di VPS existing (buat database baru, bukan instance baru).
- **ORM**: Prisma — trade-off: +20-40MB overhead memory di VPS 1GB, tapi type-safety penting untuk relasi self-referencing (`parent_child`, `spouse`) dan kemungkinan kontributor keluarga lain ikut develop.
- **Algoritma panggilan (LCA/BFS)**: dihitung di Next.js API route pakai JavaScript, BUKAN SQL recursive CTE — logika tie-break tua/muda terlalu kompleks untuk CTE yang maintainable.
- **Auth**: Custom JWT, bukan Auth.js/NextAuth — flow klaim non-standar (pending_approval) tidak cocok dipaksakan ke library auth konvensional.
- **Flow klaim (Opsi B)**: user daftar pakai kode keluarga → pilih node → `klaim_request` status pending → admin approve → sistem generate baris di `password_setup_token` → admin kirim link manual via WA → user buka link, set password → baru INSERT ke `users` dengan `person_id` terisi.
- **Deploy**: PM2 (proses Node kedua, port berbeda dari topup app) + Nginx (server block baru/subdomain) di VPS existing — TANPA Docker (VPS 1GB RAM, headroom ~500MB, overhead Docker daemon tidak worth it di sini).
- **Swap**: disarankan tambah 1-2GB swap file sebagai jaring pengaman OOM, karena VPS saat ini 0 swap.

## Satu inkonsistensi yang sengaja saya catat, bukan disembunyikan

Di `istilah_panggilan`, kolom `arah` dipaksa jadi `'atas'`/`'bawah'` untuk gap=0 (mas/mbak/dik), padahal gap=0 itu secara semantik **bukan** soal arah atas/bawah — itu soal sama generasi, beda usia. Saya isi `arah='atas'` untuk tua & muda gap=0 sekadar supaya muat di constraint yang sama dengan gap≥1. Ini bukan bug fungsional (kode aplikasi tidak akan query gap=0 lewat kolom `arah` ini, itu dihitung langsung dari `posisi`), tapi **kalau ada developer lain baca tabel ini mentah-mentah tanpa konteks, baris gap=0 akan membingungkan**. Saran: kalau mau lebih bersih, pisahkan gap=0 ke logika murni di application code dan jangan masukkan ke tabel lookup ini sama sekali — saya masukkan di sini hanya untuk satu sumber data yang konsisten, tapi ini trade-off, bukan keputusan tanpa cela.

## Hal yang HARUS diingat saat implementasi (bukan sekadar opsional)

1. **`urutan_kelahiran` diisi manual**, jangan auto-generate dari `tanggal_lahir` — generasi atas sering tanggal lahirnya tidak presisi/tidak diketahui.
2. **Algoritma panggilan butuh fungsi LCA (lowest common ancestor) via BFS** di tabel `parent_child` — ini belum dituangkan jadi SQL function/stored procedure di migration ini, sengaja ditunda sampai tech stack dipilih (lebih baik diimplementasi di application layer where graph traversal lebih natural, bukan di SQL recursive CTE yang lebih sulit di-maintain untuk logika kompleks seperti tie-break tua/muda).
3. **Audit log harus ditulis di application layer**, bukan DB trigger — Postgres tidak punya trigger native untuk `SELECT`.
4. **gap≥5 belum punya istilah** — kalau generasi ke-6 muncul, butuh validasi istilah baru ke sesepuh sebelum insert ke `istilah_panggilan`.
5. **Minimal 1 super-admin (`role='admin'` tanpa baris di `admin_scope`) wajib selalu ada** sebagai fallback approval, supaya tidak ada cabang keluarga yang macet klaimnya kalau admin cabang tidak aktif.

## Yang belum dibahas / known limitation

- Pernikahan sepupu (multi-LCA) — dikonfirmasi tidak terjadi di keluarga ini, tidak di-handle khusus.
- Skema tidak punya tabel untuk foto/dokumen keluarga — belum dibahas, di luar scope saat ini.
