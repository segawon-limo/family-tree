-- ============================================================
-- 015_person_kontak_lokasi.sql
-- Field lokasi untuk fitur Map/Globe. Ditambahkan ke person_kontak
-- yang sudah ada (bukan tabel baru) -- lihat 005_person_kontak.sql.
--
-- GRANULARITAS SENGAJA level kecamatan/kabupaten, BUKAN alamat
-- lengkap -- keputusan produk untuk alasan privasi (jangan expose
-- lokasi rumah persis anggota keluarga ke semua member) DAN akurasi
-- (geocoding alamat informal Indonesia -- dusun/RT/RW/patokan --
-- tidak reliable, sementara level kecamatan/kabupaten coverage-nya
-- jauh lebih baik di data OpenStreetMap/Nominatim).
--
-- lat/long di sini adalah HASIL CACHE dari geocoding (dipanggil sekali
-- saat admin simpan form, bukan live tiap render peta) -- BUKAN
-- diinput manual oleh admin. geocoded_at menandai kapan cache itu
-- dihitung, dipakai untuk tahu apakah perlu re-geocode kalau
-- kecamatan/kabupaten diubah.
-- ============================================================

ALTER TABLE person_kontak
    ADD COLUMN kecamatan       VARCHAR(150),
    ADD COLUMN kabupaten_kota  VARCHAR(150),
    ADD COLUMN provinsi        VARCHAR(150),
    ADD COLUMN latitude        DOUBLE PRECISION,
    ADD COLUMN longitude       DOUBLE PRECISION,
    ADD COLUMN geocoded_at     TIMESTAMPTZ;

COMMENT ON COLUMN person_kontak.latitude IS 'Cache hasil geocoding Nominatim dari kecamatan/kabupaten_kota/provinsi -- jangan diedit manual, akan tertimpa saat kecamatan/kabupaten diubah ulang.';
COMMENT ON COLUMN person_kontak.longitude IS 'Lihat komentar latitude.';