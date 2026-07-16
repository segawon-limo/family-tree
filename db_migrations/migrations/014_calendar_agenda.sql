-- ============================================================
-- 014_calendar_agenda.sql
-- Agenda keluarga yang bisa ditambahkan MEMBER (bukan cuma admin) --
-- fitur pertama di app ini yang kasih hak tulis ke member biasa.
-- Member hanya boleh edit/hapus agenda miliknya sendiri (dicek di
-- application layer via created_by_user_id === session.sub, BUKAN
-- lewat kolom/constraint di sini -- lihat app/api/calendar/[id]/route.ts).
--
-- Tanda ulang tahun & "X tahun meninggalkan kita" TIDAK disimpan di
-- tabel ini -- itu dihitung dinamis dari person.tanggal_lahir dan
-- person.tanggal_wafat tiap request. Tabel ini murni untuk agenda
-- custom yang diketik manual oleh user.
--
-- CATATAN PENTING soal tipe kolom -- BACA SEBELUM NULIS MIGRATION
-- BARU SETELAH INI:
-- File 013_password_reset_token.sql di repo ini mendeklarasikan
-- id/user_id/person_id sebagai UUID. Itu SALAH -- production nyata
-- (dicek langsung lewat information_schema.columns) kolom-kolom itu
-- semua TEXT. Artinya file 013 di repo BUKAN representasi persis
-- dari apa yang benar-benar dieksekusi ke production -- ada drift
-- antara repo dan realita, kemungkinan karena diedit manual saat
-- eksekusi tanpa commit balik ke file. JANGAN percaya tipe kolom
-- dari file .sql lama tanpa verifikasi ulang ke information_schema
-- kalau ada keraguan.
-- ============================================================

CREATE TABLE calendar_agenda (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_by_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    judul               VARCHAR(255) NOT NULL,
    deskripsi           TEXT,
    tanggal             DATE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_agenda_tanggal ON calendar_agenda(tanggal);
CREATE INDEX idx_calendar_agenda_user ON calendar_agenda(created_by_user_id);

COMMENT ON TABLE calendar_agenda IS 'Agenda custom yang ditambahkan member/admin. Tanda ulang tahun & peringatan wafat TIDAK ada di sini -- itu dihitung dinamis dari person.tanggal_lahir/tanggal_wafat di application layer.';