import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

// Create a Supabase client with the service role key to bypass RLS
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify the user's JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user || !user.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Verify if the user is a system admin
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('system_admins')
      .select('email')
      .eq('email', user.email)
      .single();

    if (adminError || !adminData) {
      return res.status(403).json({ error: 'Forbidden: User is not a system admin' });
    }

    // 3. Fetch all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .order('updated_at', { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    const profileIds = (profiles || []).map(p => p.id);

    // Fetch stores in parallel
    const [storesResult, subscriptionsResult] = await Promise.all([
      profileIds.length > 0
        ? supabaseAdmin.from('stores').select('id, name, owner_id, created_at').in('owner_id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length > 0
        ? supabaseAdmin.from('subscriptions').select('id, user_id, plan_id, status, current_period_end').in('user_id', profileIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (storesResult.error) throw storesResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;

    const stores = storesResult.data || [];
    const subscriptions = subscriptionsResult.data || [];

    // Map profiles, stores and subscriptions in-memory
    const mappedProfiles = (profiles || []).map((p: any) => {
      const pStores = stores.filter((s: any) => s.owner_id === p.id);
      
      // Keep subscriptions lookup robust by checking user_id = profile ID OR any store ID owned by them
      const storeIds = pStores.map((s: any) => s.id);
      const pSubscriptions = subscriptions.filter((sub: any) => sub.user_id === p.id || storeIds.includes(sub.user_id));

      // De-duplicate subscriptions if necessary
      const uniqueSubs: any[] = [];
      const seenSubs = new Set<string>();
      for (const sub of pSubscriptions) {
        if (!seenSubs.has(sub.id)) {
          seenSubs.add(sub.id);
          uniqueSubs.push(sub);
        }
      }

      const mappedStores = pStores.map((s: any) => ({
        id: s.id,
        name: s.name,
        created_at: s.created_at
      }));

      return {
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        role: null, // role column doesn't exist in profiles table
        updated_at: p.updated_at,
        stores: mappedStores,
        bars: mappedStores, // map stores to bars for frontend
        subscriptions: uniqueSubs.map((sub: any) => ({
          id: sub.id,
          plan_id: sub.plan_id,
          status: sub.status,
          current_period_end: sub.current_period_end
        }))
      };
    });

    return res.status(200).json({ data: mappedProfiles });
  } catch (error: any) {
    console.error('Error fetching restaurants:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
