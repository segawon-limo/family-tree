-- ============================================================
-- 001_users.sql
-- Tabel akun login. person_id null sampai klaim disetujui admin.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- untuk gen_random_uuid()

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE,
    no_hp_login     VARCHAR(20) UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    person_id       UUID UNIQUE,           -- null sampai klaim disetujui
    role            VARCHAR(20) NOT NULL DEFAULT 'member', -- 'admin' / 'member'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_login_identity CHECK (email IS NOT NULL OR no_hp_login IS NOT NULL)
);

COMMENT ON TABLE users IS 'Akun login. person_id baru terisi setelah klaim node disetujui admin.';
COMMENT ON COLUMN users.role IS 'admin = super admin (akses semua), member = anggota biasa (scope diatur via admin_scope jika jadi admin cabang)';
