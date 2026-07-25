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

    // 3. Fetch all auth users
    const { data: { users }, error: authListError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authListError) {
      console.error('Error fetching auth users:', authListError);
      return res.status(500).json({ error: 'Failed to fetch users from Supabase Auth' });
    }

    const authUsers = users || [];
    const authUserIds = authUsers.map(u => u.id);

    // Fetch profiles for the users (if any)
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .in('id', authUserIds);

    if (profilesError) {
      console.warn('Profiles query error, proceeding with empty profiles array:', profilesError);
    }

    const rawProfiles = profiles || [];
    
    // Create a map of profiles for quick lookup
    const profileMap = new Map<string, any>(rawProfiles.map((p: any) => [p.id, p]));

    // Fetch stores and subscriptions in parallel
    const [storesResult, subscriptionsResult] = await Promise.all([
      authUserIds.length > 0
        ? supabaseAdmin.from('stores').select('id, name, owner_id, created_at').in('owner_id', authUserIds)
        : Promise.resolve({ data: [], error: null }),
      authUserIds.length > 0
        ? supabaseAdmin.from('subscriptions').select('id, user_id, plan_id, status, current_period_end').in('user_id', authUserIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const stores = storesResult.data || [];
    const subscriptions = subscriptionsResult.data || [];

    // Map all auth users
    let mappedProfiles = authUsers.map((u: any) => {
      const p = profileMap.get(u.id) || {};
      const pStores = stores.filter((s: any) => s.owner_id === u.id);
      const storeIds = pStores.map((s: any) => s.id);
      const pSubscriptions = subscriptions.filter((sub: any) => sub.user_id === u.id || storeIds.includes(sub.user_id));

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
        id: u.id,
        full_name: p.full_name || u.user_metadata?.full_name || 'Usuário Cadastrado',
        email: u.email,
        avatar_url: p.avatar_url || u.user_metadata?.avatar_url,
        role: 'Proprietário',
        updated_at: p.updated_at || u.updated_at || u.created_at,
        stores: mappedStores,
        bars: mappedStores,
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
