-- ============================================================
-- 009_password_setup_token.sql
-- Token sekali-pakai untuk set password setelah klaim disetujui
-- admin (Opsi B: akun login baru eksis setelah approval, bukan
-- saat daftar). Link berisi token ini dikirim manual via WA.
-- ============================================================

CREATE TABLE password_setup_token (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    klaim_request_id UUID NOT NULL REFERENCES klaim_request(id),
    person_id       UUID NOT NULL REFERENCES person(id),
    token           VARCHAR(255) UNIQUE NOT NULL,  -- random string, generate pakai crypto.randomBytes di app layer
    expired_at      TIMESTAMPTZ NOT NULL,           -- saran: now() + interval '7 days' saat dibuat
    used_at         TIMESTAMPTZ,                    -- null = belum dipakai
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_token_token ON password_setup_token(token);

COMMENT ON TABLE password_setup_token IS 'Dibuat otomatis saat admin approve klaim_request. Link berisi token ini dikirim MANUAL via WA oleh admin (bukan email otomatis, sesuai keputusan untuk fase awal). Validasi saat dipakai: cek expired_at > now() DAN used_at IS NULL, baru izinkan set password + INSERT ke users.';
