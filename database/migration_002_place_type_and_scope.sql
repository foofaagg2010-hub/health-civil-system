-- ============================================
-- ترحيل 002: نوع مكان الولادة + تعبئة النطاق
-- نفّذ هذا الملف مرة واحدة في SQL Editor بسوبابيس
-- ============================================

-- 1. عمود نوع مكان الولادة (مستشفى / منزل)
ALTER TABLE births ADD COLUMN IF NOT EXISTS birth_place_type VARCHAR(20) DEFAULT 'مستشفى';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'births_place_type_check') THEN
        ALTER TABLE births ADD CONSTRAINT births_place_type_check CHECK (birth_place_type IN ('مستشفى', 'منزل'));
    END IF;
END $$;

UPDATE births SET birth_place_type = 'مستشفى' WHERE birth_place_type IS NULL;

-- 2. تعبئة النطاق المفقود للمواليد القديمة من حساب المنشئ
UPDATE births b
SET birth_governorate = COALESCE(NULLIF(TRIM(b.birth_governorate), ''), u.region, b.birth_governorate),
    birth_district = COALESCE(NULLIF(TRIM(b.birth_district), ''), u.district, b.birth_district),
    branch_name = COALESCE(NULLIF(TRIM(b.branch_name), ''), u.branch_name, b.branch_name)
FROM users u
WHERE u.id = b.created_by;
