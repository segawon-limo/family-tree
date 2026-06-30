-- ============================================================
-- 003_parent_child.sql
-- Relasi darah/angkat. Ini fondasi traversal LCA untuk algoritma
-- panggilan -- pastikan index terpasang, dipakai di setiap query.
-- ============================================================

CREATE TABLE parent_child (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID NOT NULL REFERENCES person(id),
    child_id    UUID NOT NULL REFERENCES person(id),
    tipe        VARCHAR(10) NOT NULL DEFAULT 'kandung' CHECK (tipe IN ('kandung','angkat')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (parent_id, child_id),
    CONSTRAINT chk_no_self_parent CHECK (parent_id <> child_id)
);

CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child  ON parent_child(child_id);

-- ------------------------------------------------------------
-- Trigger: urutan_kelahiran harus unik di antara saudara dari
-- BAPAK yang sama (lintas ibu). Ditegakkan di level DB supaya
-- tidak ada cara data korup lewat jalur manapun.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_unique_urutan_per_bapak()
RETURNS TRIGGER AS $$
DECLARE
    bapak_id UUID;
    dup_count INTEGER;
BEGIN
    SELECT pc.parent_id INTO bapak_id
    FROM parent_child pc
    JOIN person p ON p.id = pc.parent_id
    WHERE pc.child_id = NEW.child_id AND p.gender = 'L'
    LIMIT 1;

    IF bapak_id IS NOT NULL THEN
        SELECT COUNT(*) INTO dup_count
        FROM parent_child pc2
        JOIN person c ON c.id = pc2.child_id
        WHERE pc2.parent_id = bapak_id
          AND c.urutan_kelahiran = (SELECT urutan_kelahiran FROM person WHERE id = NEW.child_id)
          AND c.id <> NEW.child_id
          AND c.deleted_at IS NULL;

        IF dup_count > 0 THEN
            RAISE EXCEPTION 'urutan_kelahiran sudah dipakai saudara lain dari bapak yang sama';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_urutan
AFTER INSERT OR UPDATE ON parent_child
FOR EACH ROW EXECUTE FUNCTION check_unique_urutan_per_bapak();

COMMENT ON TABLE parent_child IS 'Graph relasi darah/angkat. Satu person bisa punya 2 parent (bapak+ibu). Traversal naik = cari leluhur (LCA), traversal turun = cari keturunan.';
