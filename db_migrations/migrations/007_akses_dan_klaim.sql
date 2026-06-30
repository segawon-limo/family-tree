-- ============================================================
-- 007_akses_dan_klaim.sql
-- Gerbang masuk (kode keluarga), proses klaim node + approval,
-- dan scope admin per-cabang.
-- ============================================================

CREATE TABLE kode_keluarga (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode        VARCHAR(50) UNIQUE NOT NULL,
    aktif       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at  TIMESTAMPTZ           -- opsional, utk rotasi kode kalau bocor
);

CREATE TABLE klaim_request (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    person_id       UUID NOT NULL REFERENCES person(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX idx_klaim_status ON klaim_request(status);

CREATE TABLE admin_scope (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    root_person_id  UUID NOT NULL REFERENCES person(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, root_person_id)
);

CREATE INDEX idx_admin_scope_user ON admin_scope(user_id);

COMMENT ON TABLE admin_scope IS 'Admin cabang berlaku utk root_person_id + SEMUA keturunannya (dihitung via traversal parent_child, bukan daftar manual). Role admin global (users.role=admin) TANPA baris di sini = akses semua node (fallback/super-admin).';
COMMENT ON TABLE klaim_request IS 'Histori klaim termasuk yang ditolak tetap tersimpan (tidak diupdate person.status_klaim secara langsung tanpa jejak).';
