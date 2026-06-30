-- ============================================================
-- 006_istilah_panggilan.sql
-- Lookup table istilah panggilan. Disimpan sebagai data, BUKAN
-- hardcode di kode aplikasi, supaya mudah dikoreksi/diperluas
-- tanpa redeploy.
--
-- Aturan pemakaian (ringkas dari hasil diskusi):
--   gap=0          -> posisi WAJIB diisi (tua/muda), gender dipakai
--   gap=1          -> posisi WAJIB diisi (tua/muda), gender dipakai
--                      (pakde/bude = tua, paklik/bulik = muda)
--   gap>=2         -> posisi NULL (flat, tidak peduli tua/muda),
--                      gender NULL juga (istilah sama utk L/P)
--   arah='bawah'   -> selalu flat (dik/cucu/buyut/canggah),
--                      tidak ada pembagian gender/posisi
-- ============================================================

CREATE TABLE istilah_panggilan (
    id      SERIAL PRIMARY KEY,
    gap     INTEGER NOT NULL,
    arah    VARCHAR(10) NOT NULL CHECK (arah IN ('atas','bawah')),
    gender  CHAR(1) CHECK (gender IN ('L','P')),   -- NULL = sama utk L/P
    posisi  VARCHAR(10) CHECK (posisi IN ('tua','muda')), -- NULL = flat
    istilah VARCHAR(50) NOT NULL,
    UNIQUE (gap, arah, gender, posisi)
);

-- gap=0: ditentukan oleh kode aplikasi (mas/mbak/dik), tapi tetap
-- dicatat di sini untuk konsistensi & supaya UI bisa tampilkan dari 1 sumber
INSERT INTO istilah_panggilan (gap, arah, gender, posisi, istilah) VALUES
(0, 'atas', 'L', 'tua',  'mas'),
(0, 'atas', 'P', 'tua',  'mbak'),
(0, 'atas', NULL,'muda', 'dik');

-- gap=1 atas: pakde/bude (lebih tua dari ortu) vs paklik/bulik (lebih muda)
INSERT INTO istilah_panggilan (gap, arah, gender, posisi, istilah) VALUES
(1, 'atas', 'L', 'tua',  'pakde'),
(1, 'atas', 'L', 'muda', 'paklik'),
(1, 'atas', 'P', 'tua',  'bude'),
(1, 'atas', 'P', 'muda', 'bulik'),
(1, 'bawah', NULL, NULL, 'dik');

-- gap>=2: flat, tidak peduli gender/posisi
INSERT INTO istilah_panggilan (gap, arah, gender, posisi, istilah) VALUES
(2, 'atas',  NULL, NULL, 'mbah'),
(2, 'bawah', NULL, NULL, 'cucu'),
(3, 'atas',  NULL, NULL, 'mbah buyut'),
(3, 'bawah', NULL, NULL, 'buyut'),
(4, 'atas',  NULL, NULL, 'mbah canggah'),
(4, 'bawah', NULL, NULL, 'canggah');

COMMENT ON TABLE istilah_panggilan IS 'gap>=5 (generasi ke-6 dst) belum ada istilah terkonfirmasi -- validasi ke sesepuh sebelum tree bertambah generasi.';
