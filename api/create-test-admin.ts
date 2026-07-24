import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing service role key.' });
    }

    const { email, password } = req.body || {};

    if (email !== 'admin@admin.com') {
        return res.status(403).json({ error: 'Only authorized for test admin account creation.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    // Try to create the user with auto-confirm
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (error) {
        if (error.message.includes('already exists') || error.message.includes('already registered')) {
            // If it exists but is not confirmed, try to update it to confirmed
            try {
                // We need the user ID to update them, so we list users
                const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
                const user = usersData?.users.find(u => u.email === email);
                if (user && !user.email_confirmed_at) {
                    await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
                }
            } catch (e) {
                // Ignore errors during update attempt
            }
            return res.status(200).json({ success: true, message: 'User already exists, attempted confirmation.' });
        }
        return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
}
