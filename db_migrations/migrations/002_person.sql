-- ============================================================
-- 002_person.sql
-- Node utama tree. urutan_kelahiran dihitung lintas-ibu
-- (semua anak dari bapak yang sama, diurutkan global).
-- ============================================================

CREATE TABLE person (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama                VARCHAR(255) NOT NULL,
    gender              CHAR(1) NOT NULL CHECK (gender IN ('L','P')),
    tanggal_lahir       DATE,
    tanggal_wafat       DATE,
    urutan_kelahiran    INTEGER NOT NULL,
    status_klaim        VARCHAR(20) NOT NULL DEFAULT 'unclaimed'
                            CHECK (status_klaim IN ('unclaimed','pending_approval','claimed')),
    catatan             TEXT,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ            -- soft delete, JANGAN hard delete person
);

ALTER TABLE users ADD CONSTRAINT fk_users_person
    FOREIGN KEY (person_id) REFERENCES person(id);

COMMENT ON COLUMN person.urutan_kelahiran IS 'Urutan kelahiran di antara saudara dari BAPAK yang sama (lintas ibu jika ada). Diisi manual oleh admin/sesepuh, jangan diasumsikan dari tanggal_lahir karena generasi atas sering tidak presisi.';
COMMENT ON COLUMN person.deleted_at IS 'Soft delete only. Data orang (apalagi yang wafat) tidak boleh hilang permanen.';
