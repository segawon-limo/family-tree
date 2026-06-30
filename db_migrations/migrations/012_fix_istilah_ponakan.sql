-- ============================================================
-- 012_fix_istilah_ponakan.sql
-- Perbaikan: gap=1 arah='bawah' sebelumnya diisi 'dik' (migration 006),
-- yang SALAH secara budaya -- itu istilah utk gap=0 (sesama generasi
-- lebih muda). Istilah yang benar utk anak dari saudara ortu (gap=1
-- ke bawah) adalah 'ponakan'.
--
-- CATATAN: ini gender-neutral (ponakan laki-laki & perempuan sama-sama
-- disebut "ponakan" di kebanyakan konteks Jawa Timur) -- kalau ternyata
-- keluarga kamu membedakan istilah berdasar gender utk ini, kasih tahu,
-- gampang ditambah row terpisah (gender='L'/'P') seperti pola pakde/bude.
-- ============================================================

UPDATE istilah_panggilan
SET istilah = 'ponakan'
WHERE gap = 1 AND arah = 'bawah' AND gender IS NULL AND posisi IS NULL;