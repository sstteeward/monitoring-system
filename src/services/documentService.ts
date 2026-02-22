import { supabase } from '../lib/supabaseClient';

export interface StudentDocument {
    id: string;
    user_id: string;
    title: string;
    file_name: string;
    file_path: string;
    file_type: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    updated_at: string;
}

export const documentService = {
    async getDocuments() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('student_documents')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as StudentDocument[];
    },

    async uploadDocument(file: File, title: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 1. Upload file to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Create database record
        const { data, error: dbError } = await supabase
            .from('student_documents')
            .insert({
                user_id: user.id,
                title,
                file_name: file.name,
                file_path: filePath,
                file_type: file.type || 'application/octet-stream'
            })
            .select()
            .single();

        if (dbError) {
            // Cleanup storage if database insert fails
            await supabase.storage.from('documents').remove([filePath]);
            throw dbError;
        }

        return data as StudentDocument;
    },

    async deleteDocument(id: string, filePath: string) {
        // 1. Delete from storage
        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([filePath]);

        if (storageError) throw storageError;

        // 2. Delete from database
        const { error: dbError } = await supabase
            .from('student_documents')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
        return true;
    },

    async getDownloadUrl(filePath: string) {
        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, 60 * 60); // 1 hour link

        if (error) throw error;
        return data.signedUrl;
    }
};
