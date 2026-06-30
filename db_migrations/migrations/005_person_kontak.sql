-- ============================================================
-- 005_person_kontak.sql
-- Data sensitif, diisi sendiri oleh pemilik node, semua kolom
-- optional. Berbeda dari person (skeleton tree, bisa diisi admin).
-- ============================================================

CREATE TABLE person_kontak (
    person_id           UUID PRIMARY KEY REFERENCES person(id),
    no_hp_utama         VARCHAR(20),
    no_hp_alternatif    VARCHAR(20),
    alamat_domisili     TEXT,
    kota                VARCHAR(100),
    pekerjaan           VARCHAR(150),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE person_kontak IS 'Hanya pemilik (user dengan person_id yang sesuai) yang boleh INSERT/UPDATE baris miliknya sendiri. Semua user login bisa SELECT semua baris (sesuai keputusan akses keluarga). Baris ini boleh di-hard-delete jika pemilik minta hapus data pribadi.';
