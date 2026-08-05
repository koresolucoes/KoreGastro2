import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: Request, res: Response) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { data, error } = await supabase.from('tables').select('*').limit(1);
    if (error) {
        return res.status(500).json({ error });
    }
    return res.status(200).json({ data });
}
