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

-- ============================================================
-- 011_register_support.sql
-- Support tabel untuk flow registrasi + klaim + request koreksi data
-- ============================================================

-- Tambah email & no_hp ke klaim_request -- dikumpulkan di step 2
-- registrasi (sebelum pilih node), disimpan di sini karena tabel
-- users belum dibuat sampai admin approve klaim.
ALTER TABLE klaim_request
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS no_hp VARCHAR(20),
  ADD COLUMN IF NOT EXISTS catatan_penolakan TEXT; -- alasan reject dari admin

-- Notifikasi "nama tidak ditemukan" -- dikirim user saat step 3
-- registrasi dan nama mereka tidak ada di daftar unclaimed.
-- Admin perlu tindak lanjut: cek apakah node belum diinput,
-- lalu buat nodenya dan kirim ulang kode ke email ini.
CREATE TABLE register_inquiry (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nama_dicari VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  no_hp       VARCHAR(20),
  catatan     TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_by TEXT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE change_request (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  person_id     TEXT NOT NULL REFERENCES person(id),
  requested_by  TEXT NOT NULL REFERENCES users(id),
  field_name    VARCHAR(50) NOT NULL,
  old_value     TEXT,
  new_value     TEXT NOT NULL,
  catatan       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by   TEXT REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_register_inquiry_status ON register_inquiry(status);
CREATE INDEX idx_change_request_status ON change_request(status);
CREATE INDEX idx_change_request_person ON change_request(person_id);