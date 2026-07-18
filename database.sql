-- ============================================
-- نظام ربط الصحة بالأحوال المدنية
-- قاعدة البيانات الكاملة - نسخة مصححة
-- ============================================

-- ============================================
-- 1. جدول المستخدمين (موسع)
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'employee',
    role_type VARCHAR(30) DEFAULT 'employee',
    branch_name VARCHAR(200),
    hospital_name VARCHAR(200),
    region VARCHAR(100),
    district VARCHAR(100),
    phone_number VARCHAR(20),
    whatsapp_number VARCHAR(20),
    admin_phone VARCHAR(20),
    tech_phone VARCHAR(20),
    midwife_license VARCHAR(50),
    phone_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_view_logs BOOLEAN DEFAULT FALSE,
    can_view_users BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

COMMENT ON COLUMN users.role IS 'الدور العام: employee, supervisor, admin';
COMMENT ON COLUMN users.role_type IS 'نوع الدور: midwife, health_officer, civil_officer, admin';
COMMENT ON COLUMN users.midwife_license IS 'رقم ترخيص القابلة';

-- إضافة أعمدة إضافية إذا لم تكن موجودة (للتحديثات)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone_verified') THEN
        ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
    END IF;
END $$;


-- ============================================
-- 2. جدول المواليد
-- ============================================

CREATE TABLE IF NOT EXISTS births (
    id SERIAL PRIMARY KEY,
    birth_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- مراجع المستخدمين
    midwife_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    health_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    civil_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- بيانات المولود الأساسية
    baby_gender VARCHAR(10) NOT NULL CHECK (baby_gender IN ('ذكر', 'أنثى')),
    father_name VARCHAR(200) NOT NULL,
    mother_name VARCHAR(200) NOT NULL,
    mother_national_id VARCHAR(20),
    father_national_id VARCHAR(20),
    
    -- مكان وتاريخ الولادة
    birth_place VARCHAR(300) NOT NULL,
    birth_governorate VARCHAR(100),
    birth_district VARCHAR(100),
    birth_date DATE NOT NULL DEFAULT CURRENT_DATE,
    birth_time TIME,
    
    -- نوع الولادة
    birth_type VARCHAR(20) NOT NULL CHECK (birth_type IN ('مفرد', 'توأم', 'ثلاثة', 'أكثر')),
    delivery_type VARCHAR(30) CHECK (delivery_type IN ('طبيعي', 'قيصري', 'مساعدة')),
    
    -- بيانات الأم
    mother_age INTEGER,
    mother_phone VARCHAR(20) NOT NULL,
    mother_address VARCHAR(300),
    
    -- بيانات الطفل
    baby_weight DECIMAL(5,2),
    baby_height DECIMAL(5,2),
    health_status VARCHAR(50) DEFAULT 'جيد' CHECK (health_status IN ('جيد', 'يحتاج متابعة', 'حرج', 'حالة خاصة')),
    health_notes TEXT,
    
    -- بيانات التوأم
    twin_baby_gender VARCHAR(10) CHECK (twin_baby_gender IN ('ذكر', 'أنثى', NULL)),
    twin_baby_weight DECIMAL(5,2),
    twin_baby_height DECIMAL(5,2),
    twin_health_status VARCHAR(50) CHECK (twin_health_status IN ('جيد', 'يحتاج متابعة', 'حرج', 'حالة خاصة', NULL)),
    twin_health_notes TEXT,
    
    -- حالات النظام
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending', 'confirmed', 'printed', 'notified_civil',
        'civil_received', 'certificate_issued', 'rejected', 'cancelled'
    )),
    
    -- تتبع الإجراءات
    is_notified BOOLEAN DEFAULT FALSE,
    notification_date TIMESTAMP,
    notification_sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    is_certificate_issued BOOLEAN DEFAULT FALSE,
    certificate_issue_date TIMESTAMP,
    certificate_issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    certificate_number VARCHAR(50),
    
    -- QR Code
    qr_code TEXT,
    qr_code_generated_at TIMESTAMP,
    
    -- مصدر التسجيل
    registration_source VARCHAR(30) CHECK (registration_source IN ('midwife', 'health_officer', 'hospital', 'home')),
    registration_note TEXT,
    
    -- تواريخ النظام
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_births_birth_number ON births(birth_number);
CREATE INDEX IF NOT EXISTS idx_births_mother_name ON births(mother_name);
CREATE INDEX IF NOT EXISTS idx_births_father_name ON births(father_name);
CREATE INDEX IF NOT EXISTS idx_births_birth_date ON births(birth_date);
CREATE INDEX IF NOT EXISTS idx_births_status ON births(status);
CREATE INDEX IF NOT EXISTS idx_births_midwife_id ON births(midwife_id);
CREATE INDEX IF NOT EXISTS idx_births_health_officer_id ON births(health_officer_id);
CREATE INDEX IF NOT EXISTS idx_births_civil_officer_id ON births(civil_officer_id);
CREATE INDEX IF NOT EXISTS idx_births_created_at ON births(created_at);

COMMENT ON TABLE births IS 'جدول المواليد - يربط بين القابلات ومكتب الصحة والأحوال المدنية';


-- ============================================
-- 3. جدول إخطارات الولادة
-- ============================================

CREATE TABLE IF NOT EXISTS birth_notifications (
    id SERIAL PRIMARY KEY,
    birth_id INTEGER NOT NULL REFERENCES births(id) ON DELETE CASCADE,
    notification_number VARCHAR(50) UNIQUE NOT NULL,
    
    printed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    printed_at TIMESTAMP DEFAULT NOW(),
    
    midwife_signed BOOLEAN DEFAULT FALSE,
    midwife_signed_at TIMESTAMP,
    midwife_signature_image TEXT,
    
    hospital_director_signed BOOLEAN DEFAULT FALSE,
    hospital_director_signed_at TIMESTAMP,
    hospital_director_signature_image TEXT,
    
    is_sent_to_civil BOOLEAN DEFAULT FALSE,
    sent_to_civil_at TIMESTAMP,
    sent_to_civil_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    is_received_by_civil BOOLEAN DEFAULT FALSE,
    received_by_civil_at TIMESTAMP,
    received_by_civil_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    pdf_url TEXT,
    pdf_generated_at TIMESTAMP,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_birth_notifications_birth_id ON birth_notifications(birth_id);
CREATE INDEX IF NOT EXISTS idx_birth_notifications_notification_number ON birth_notifications(notification_number);
CREATE INDEX IF NOT EXISTS idx_birth_notifications_printed_at ON birth_notifications(printed_at);
CREATE INDEX IF NOT EXISTS idx_birth_notifications_is_sent_to_civil ON birth_notifications(is_sent_to_civil);

COMMENT ON TABLE birth_notifications IS 'إخطارات الولادة - المذكرات المطبوعة والمُرسلة للأحوال';


-- ============================================
-- 4. جدول سير العمل
-- ============================================

CREATE TABLE IF NOT EXISTS birth_workflow_logs (
    id SERIAL PRIMARY KEY,
    birth_id INTEGER NOT NULL REFERENCES births(id) ON DELETE CASCADE,
    
    stage VARCHAR(30) NOT NULL CHECK (stage IN (
        'created_by_midwife', 'sent_to_health', 'reviewed_by_health',
        'notification_printed', 'sent_to_civil', 'received_by_civil',
        'certificate_issued'
    )),
    
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(200),
    performed_by_role VARCHAR(50),
    
    details TEXT,
    metadata JSONB,
    
    performed_at TIMESTAMP DEFAULT NOW(),
    duration_seconds INTEGER,
    
    ip_address VARCHAR(50),
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birth_workflow_logs_birth_id ON birth_workflow_logs(birth_id);
CREATE INDEX IF NOT EXISTS idx_birth_workflow_logs_stage ON birth_workflow_logs(stage);
CREATE INDEX IF NOT EXISTS idx_birth_workflow_logs_performed_at ON birth_workflow_logs(performed_at);


-- ============================================
-- 5. جدول الإحصائيات اليومية
-- ============================================

CREATE TABLE IF NOT EXISTS daily_birth_stats (
    id SERIAL PRIMARY KEY,
    stat_date DATE NOT NULL UNIQUE,
    
    total_births INTEGER DEFAULT 0,
    
    from_midwife INTEGER DEFAULT 0,
    from_health_officer INTEGER DEFAULT 0,
    from_hospital INTEGER DEFAULT 0,
    from_home INTEGER DEFAULT 0,
    
    pending INTEGER DEFAULT 0,
    confirmed INTEGER DEFAULT 0,
    printed INTEGER DEFAULT 0,
    notified_civil INTEGER DEFAULT 0,
    civil_received INTEGER DEFAULT 0,
    certificate_issued INTEGER DEFAULT 0,
    
    male_births INTEGER DEFAULT 0,
    female_births INTEGER DEFAULT 0,
    
    single_births INTEGER DEFAULT 0,
    twin_births INTEGER DEFAULT 0,
    
    governorate_stats JSONB,
    
    avg_time_to_notification_hours DECIMAL(10,2),
    avg_time_to_certificate_days DECIMAL(10,2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_birth_stats_stat_date ON daily_birth_stats(stat_date);


-- ============================================
-- 6. الدوال المخزنة (Triggers & Functions)
-- ============================================

-- 6.1 توليد رقم المولود
CREATE OR REPLACE FUNCTION generate_birth_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_part VARCHAR(6);
BEGIN
    year_part := TO_CHAR(NEW.birth_date, 'YYYY');
    
    SELECT LPAD(COALESCE(MAX(CAST(SUBSTRING(birth_number FROM 7) AS INTEGER)), 0) + 1, 6, '0')
    INTO seq_part
    FROM births
    WHERE birth_number LIKE 'B-' || year_part || '-%';
    
    NEW.birth_number := 'B-' || year_part || '-' || seq_part;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_birth_number ON births;
CREATE TRIGGER trigger_generate_birth_number
BEFORE INSERT ON births
FOR EACH ROW
WHEN (NEW.birth_number IS NULL)
EXECUTE FUNCTION generate_birth_number();

-- 6.2 توليد رقم الإخطار
CREATE OR REPLACE FUNCTION generate_notification_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_part VARCHAR(6);
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    SELECT LPAD(COALESCE(MAX(CAST(SUBSTRING(notification_number FROM 7) AS INTEGER)), 0) + 1, 6, '0')
    INTO seq_part
    FROM birth_notifications
    WHERE notification_number LIKE 'N-' || year_part || '-%';
    
    NEW.notification_number := 'N-' || year_part || '-' || seq_part;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_notification_number ON birth_notifications;
CREATE TRIGGER trigger_generate_notification_number
BEFORE INSERT ON birth_notifications
FOR EACH ROW
WHEN (NEW.notification_number IS NULL)
EXECUTE FUNCTION generate_notification_number();

-- 6.3 تحديث updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_births_updated_at ON births;
CREATE TRIGGER trigger_update_births_updated_at
BEFORE UPDATE ON births
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_birth_notifications_updated_at ON birth_notifications;
CREATE TRIGGER trigger_update_birth_notifications_updated_at
BEFORE UPDATE ON birth_notifications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- 7. العرض الشامل (View) - نسخة مصححة
-- ============================================

DROP VIEW IF EXISTS v_births_full;

CREATE OR REPLACE VIEW v_births_full AS
SELECT 
    b.*,
    -- معلومات القابلة
    m.username AS midwife_name,
    m.phone_number AS midwife_phone,
    m.whatsapp_number AS midwife_whatsapp,
    -- معلومات موظف الصحة
    h.username AS health_officer_name,
    h.phone_number AS health_officer_phone,
    h.whatsapp_number AS health_officer_whatsapp,
    -- معلومات موظف الأحوال
    c.username AS civil_officer_name,
    c.phone_number AS civil_officer_phone,
    -- معلومات الإخطار
    bn.id AS notification_id,
    bn.notification_number,
    bn.printed_at AS notification_printed_at,
    bn.is_sent_to_civil AS notification_sent,
    bn.sent_to_civil_at AS notification_sent_at,
    bn.is_received_by_civil AS notification_received,
    bn.received_by_civil_at AS notification_received_at,
    -- حساب المدة
    EXTRACT(EPOCH FROM (NOW() - b.created_at)) / 3600 AS hours_since_creation,
    CASE 
        WHEN b.certificate_issue_date IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (b.certificate_issue_date - b.birth_date)) / 86400
        ELSE NULL
    END AS days_to_certificate
FROM births b
LEFT JOIN users m ON b.midwife_id = m.id
LEFT JOIN users h ON b.health_officer_id = h.id
LEFT JOIN users c ON b.civil_officer_id = c.id
LEFT JOIN birth_notifications bn ON b.id = bn.birth_id AND bn.deleted_at IS NULL
WHERE b.deleted_at IS NULL;


-- ============================================
-- 8. بيانات تجريبية
-- ============================================

-- ملاحظة: استخدم كلمات مرور مشفرة باستخدام bcrypt
-- يمكنك توليدها باستخدام: https://bcrypt-generator.com/

INSERT INTO users (username, password_hash, role, role_type, branch_name, is_active, can_edit, midwife_license, hospital_name, region, phone_number, whatsapp_number)
VALUES 
('midwife1', '$2a$10$YOUR_HASH_HERE', 'employee', 'midwife', 'مركز صحي السلام', true, false, 'MW-2026-001', NULL, 'لحج', '771234567', '771234567'),
('health1', '$2a$10$YOUR_HASH_HERE', 'supervisor', 'health_officer', 'مستشفى السلام العام', true, true, NULL, 'مستشفى السلام العام', 'لحج', '771234568', '771234568'),
('civil1', '$2a$10$YOUR_HASH_HERE', 'supervisor', 'civil_officer', 'مكتب الأحوال المدنية - لحج', true, false, NULL, NULL, 'لحج', '771234569', '771234569'),
('admin1', '$2a$10$YOUR_HASH_HERE', 'admin', 'admin', 'الإدارة العامة', true, true, NULL, NULL, 'لحج', '771234570', '771234570')
ON CONFLICT (username) DO NOTHING;


-- ============================================
-- 8.5 جدول الجلسات (admin_sessions)
-- ============================================

CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);


-- ============================================
-- 9. سياسات الأمان (RLS) - مبسطة
-- ============================================

-- تفعيل RLS على الجداول الجديدة
ALTER TABLE births ENABLE ROW LEVEL SECURITY;
ALTER TABLE birth_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE birth_workflow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_birth_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- سياسة عامة للقراءة (يمكن تعديلها حسب الحاجة)

-- سياسات جدول المستخدمين
DROP POLICY IF EXISTS allow_all_users ON users;
CREATE POLICY allow_all_users ON users
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- سياسات جدول الجلسات
DROP POLICY IF EXISTS allow_all_sessions ON admin_sessions;
CREATE POLICY allow_all_sessions ON admin_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_births ON births;
CREATE POLICY allow_all_births ON births
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_notifications ON birth_notifications;
CREATE POLICY allow_all_notifications ON birth_notifications
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_workflow ON birth_workflow_logs;
CREATE POLICY allow_all_workflow ON birth_workflow_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_stats ON daily_birth_stats;
CREATE POLICY allow_all_stats ON daily_birth_stats
    FOR ALL
    USING (true)
    WITH CHECK (true);