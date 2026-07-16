-- ============================================================
-- 013_password_reset_token.sql
-- Token sekali-pakai untuk RESET password (beda dari
-- password_setup_token yang terikat ke klaim_request_id dan cuma
-- valid untuk set-password PERTAMA KALI setelah klaim disetujui).
-- Tabel ini terhubung langsung ke user_id -- dipakai admin kapan
-- saja setelah akun sudah ada, bukan cuma sekali di awal.
-- Link berisi token dikirim MANUAL oleh admin (WA dsb), BUKAN
-- email otomatis -- app belum punya domain terverifikasi.
--
-- PENTING: schema.prisma HARUS diupdate bersamaan dengan migration
-- ini (lihat model PasswordResetToken) -- migration 011_person_foto.sql
-- sempat lupa langkah ini dan bikin app crash produksi. Jangan ulangi.
-- ============================================================

CREATE TABLE password_reset_token (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    person_id   UUID NOT NULL REFERENCES person(id),
    token       VARCHAR(255) UNIQUE NOT NULL,  -- crypto.randomBytes(48).toString('hex') di app layer
    expired_at  TIMESTAMPTZ NOT NULL,           -- saran: now() + interval '3 days' saat dibuat (lebih pendek dari setup-password karena resiko link nyasar/telat dipakai)
    used_at     TIMESTAMPTZ,                    -- null = belum dipakai
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_token_token ON password_reset_token(token);
CREATE INDEX idx_password_reset_token_user ON password_reset_token(user_id);

COMMENT ON TABLE password_reset_token IS 'Dibuat manual oleh admin lewat tombol "Generate link reset password" di halaman admin. Link dikirim MANUAL via WA. Validasi saat dipakai: cek expired_at > now() DAN used_at IS NULL. Saat generate token baru untuk user yang sama, invalidasi (set used_at = now()) token lama yang belum dipakai supaya tidak ada beberapa link valid sekaligus.';