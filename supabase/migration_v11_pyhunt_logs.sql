-- Create pyhunt_logs table to track /unlock attempts
CREATE TABLE IF NOT EXISTS public.pyhunt_logs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    round_id INT NOT NULL,
    submitted_code TEXT,
    expected_code TEXT,
    is_success BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.pyhunt_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view the logs
CREATE POLICY "Admins can view pyhunt_logs"
    ON public.pyhunt_logs
    FOR SELECT
    USING (
        auth.role() = 'authenticated' 
        AND auth.uid() IN (SELECT id FROM admins)
    );

-- Admins can insert if they want, but mostly service role will insert
CREATE POLICY "Admins can insert pyhunt_logs"
    ON public.pyhunt_logs
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() IN (SELECT id FROM admins)
    );
