
-- Create student_documents table
CREATE TABLE IF NOT EXISTS public.student_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own documents
CREATE POLICY "Users can view own documents" 
  ON public.student_documents FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own documents
CREATE POLICY "Users can insert own documents" 
  ON public.student_documents FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own documents (e.g., status or title)
CREATE POLICY "Users can update own documents" 
  ON public.student_documents FOR UPDATE 
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER on_documents_updated
  BEFORE UPDATE ON public.student_documents
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- NOTE: Ensure you have a 'documents' bucket in Supabase Storage with RLS enabled.
-- You can run these commands in the SQL editor to set up Storage policies:
/*
-- Allow users to upload to their own folder in the 'documents' bucket
CREATE POLICY "Allow authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to view their own files
CREATE POLICY "Allow authenticated select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
*/
