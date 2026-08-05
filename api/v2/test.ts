import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: Request, res: Response) {
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('tables').select('*').limit(1);
    if (error) {
        return res.status(500).json({ error });
    }
    return res.status(200).json({ data });
}
