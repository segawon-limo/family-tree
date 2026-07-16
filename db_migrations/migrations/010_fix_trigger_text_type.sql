-- ============================================================
-- FIX: trigger sebelumnya pakai tipe UUID, padahal kolom id di
-- database ini bertipe TEXT (default mapping Prisma untuk
-- `String @id @default(uuid())` tanpa anotasi @db.Uuid).
-- Jalankan ini untuk REPLACE function lama -- CREATE OR REPLACE
-- jadi aman dijalankan walau function sudah ada.
-- ============================================================

CREATE OR REPLACE FUNCTION check_unique_urutan_per_bapak()
RETURNS TRIGGER AS $$
DECLARE
    bapak_id TEXT;
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

-- Trigger-nya sendiri tidak perlu dibuat ulang (sudah ada dari
-- sebelumnya, cuma function-nya yang diganti isinya). Tapi kalau
-- kamu belum pernah berhasil pasang trigger-nya sama sekali
-- (karena gagal di percobaan sebelumnya), jalankan juga ini:
DROP TRIGGER IF EXISTS trg_check_urutan ON parent_child;
CREATE TRIGGER trg_check_urutan
AFTER INSERT OR UPDATE ON parent_child
FOR EACH ROW EXECUTE FUNCTION check_unique_urutan_per_bapak();
