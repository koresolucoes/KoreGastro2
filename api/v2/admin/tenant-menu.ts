import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseServiceKey || 'placeholder-key', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req: any, res: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user || !user.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('system_admins')
      .select('email')
      .eq('email', user.email)
      .single();

    if (adminError || !adminData) {
      return res.status(403).json({ error: 'Forbidden: User is not a system admin' });
    }

    if (req.method === 'GET') {
      const { tenantId } = req.query;
      
      if (!tenantId || typeof tenantId !== 'string') {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const { data, error } = await supabaseAdmin
        .from('recipes')
        .select('*, categories(name)')
        .eq('user_id', tenantId)
        .order('name');

      if (error) throw error;

      return res.status(200).json({ data });
    } else if (req.method === 'PUT') {
      const { id, updates } = req.body;
      
      if (!id || !updates) {
         return res.status(400).json({ error: 'id and updates are required' });
      }

      const { data, error } = await supabaseAdmin
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      return res.status(200).json({ data });
    } else if (req.method === 'POST') {
      const { tenantId, item } = req.body;

      if (!tenantId || !item) {
        return res.status(400).json({ error: 'tenantId and item are required' });
      }

      // We need a category, check if one exists or create a default
      let { data: catData } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('user_id', tenantId)
        .limit(1)
        .single();

      let categoryId = catData?.id;
      if (!categoryId) {
         const { data: newCat } = await supabaseAdmin
           .from('categories')
           .insert([{ name: 'Geral', user_id: tenantId }])
           .select()
           .single();
         categoryId = newCat?.id;
      }

      const { data, error } = await supabaseAdmin
        .from('recipes')
        .insert([{
          name: item.name,
          price: item.price,
          is_available: item.is_available,
          user_id: tenantId,
          category_id: categoryId,
          prep_time_in_minutes: 15,
          is_sub_recipe: false
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in tenant-menu endpoint:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
