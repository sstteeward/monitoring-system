-- 1. Add coordinator_signature to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coordinator_signature TEXT;

-- 2. Create dtr_signatures table
CREATE TABLE IF NOT EXISTS dtr_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dtr_record_id UUID REFERENCES dtr_records(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(auth_user_id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    signed_by UUID NOT NULL REFERENCES profiles(auth_user_id) ON DELETE CASCADE,
    signature_url TEXT NOT NULL,
    signed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, record_date)
);

-- 3. Set up RLS for dtr_signatures
ALTER TABLE dtr_signatures ENABLE ROW LEVEL SECURITY;

-- Students can view their own signatures
CREATE POLICY "Users can view their own DTR signatures"
    ON dtr_signatures FOR SELECT
    USING (auth.uid() = user_id);

-- Coordinators and Admins can view all signatures
CREATE POLICY "Coordinators and Admins can view all DTR signatures"
    ON dtr_signatures FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND (profiles.account_type = 'coordinator' OR profiles.account_type = 'admin')
        )
    );

-- Coordinators can insert signatures
CREATE POLICY "Coordinators can insert signatures"
    ON dtr_signatures FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND profiles.account_type = 'coordinator'
        )
        AND auth.uid() = signed_by
    );

-- Coordinators can delete signatures (unsign)
CREATE POLICY "Coordinators can delete signatures"
    ON dtr_signatures FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.auth_user_id = auth.uid() 
            AND profiles.account_type = 'coordinator'
        )
    );
