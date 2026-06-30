-- ============================================================
-- 008_audit_log.sql
-- Jejak siapa lihat/edit data siapa. Penting karena akses data
-- sensitif (person_kontak) dibuka untuk SEMUA user yang login --
-- audit log adalah satu-satunya jejak kalau ada masalah nanti.
-- ============================================================

CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    action              VARCHAR(50) NOT NULL,  -- view_kontak / edit_person / approve_klaim / dst
    target_person_id    UUID REFERENCES person(id),
    detail              JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_target ON audit_log(target_person_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

COMMENT ON TABLE audit_log IS 'Tulis log ini di application layer setiap kali endpoint view_kontak/edit dipanggil -- jangan andalkan DB trigger utk SELECT (Postgres tidak bisa trigger on SELECT).';
