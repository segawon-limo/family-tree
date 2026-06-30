-- ============================================================
-- 011_person_foto.sql
-- Tambah kolom foto profil ke tabel person.
--
-- CATATAN DESAIN (sengaja didokumentasikan, bukan default diam-diam):
-- - Kolom menyimpan PATH RELATIF ke file di disk server (BUKAN URL publik,
--   BUKAN BLOB di database). File fisik disimpan di folder
--   `storage/foto-profil/` di root project -- DI LUAR `public/`, supaya
--   tidak otomatis bisa diakses tanpa lewat API route.
-- - Alasan di luar public/: begitu JWT middleware (backlog #4) jadi,
--   akses ke foto bisa di-gate di route serve-nya. Kalau dari awal taruh
--   di public/, foto akan selamanya bisa diakses langsung lewat URL
--   tanpa auth, dan migrasi ke gated access jadi breaking change nanti.
-- - format path yang disimpan: "<personId>.<ext>" -- bukan filename asli
--   upload, supaya tidak ada collision dan tidak bocor nama file asli.
-- ============================================================

ALTER TABLE person ADD COLUMN foto_path VARCHAR(255);

COMMENT ON COLUMN person.foto_path IS 'Path relatif file foto profil di storage/foto-profil/ (bukan URL publik). NULL = belum upload foto. Diserve lewat /api/foto/[personId], bukan diakses langsung dari disk.';