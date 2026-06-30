-- ============================================================
-- 004_spouse.sql
-- Relasi pernikahan, BUKAN hubungan darah. Tidak ikut traversal
-- LCA -- dipakai sebagai layer kedua di algoritma panggilan
-- (istri/suami ikut posisi pasangannya).
-- ============================================================

CREATE TABLE spouse (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person1_id      UUID NOT NULL REFERENCES person(id),
    person2_id      UUID NOT NULL REFERENCES person(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'menikah' CHECK (status IN ('menikah','cerai','wafat')),
    tanggal_nikah   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_no_self_spouse CHECK (person1_id <> person2_id),
    UNIQUE (person1_id, person2_id)
);

CREATE INDEX idx_spouse_person1 ON spouse(person1_id);
CREATE INDEX idx_spouse_person2 ON spouse(person2_id);

COMMENT ON TABLE spouse IS 'Pernikahan berurutan (misal pasangan pertama wafat, menikah lagi) dicatat sebagai 2 baris terpisah dengan status berbeda, bukan poligami simultan.';
