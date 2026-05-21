import { VercelRequest, VercelResponse } from '@vercel/node';
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
      .select(`
        id,
        full_name,
        avatar_url,
        updated_at
      `)
      .order('updated_at', { ascending: false });

    if (profilesError) {
      throw profilesError;
    }
    
    // 3.5 Fetch all users using admin API
    const { data: authData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers();
    if (authUsersError) {
       console.warn('Error fetching auth users:', authUsersError);
    }
    const authUsers = authData?.users || [];

    // 4. Fetch all stores and subscriptions
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('stores')
      .select(`
        id,
        name,
        created_at,
        owner_id,
        subscriptions (
          id,
          plan_id,
          status,
          current_period_end,
          plans (
            name,
            price
          )
        ),
        company_profile (
          company_name,
          phone
        )
      `);

    if (storesError) {
      throw storesError;
    }

    // Merge stores and their subscriptions to profiles
    const formattedProfiles = profiles?.map((profile: any) => {
      const userStores = stores?.filter((store: any) => store.owner_id === profile.id) || [];
      const userSubscriptions = userStores.flatMap((store: any) => store.subscriptions || []);
      const authUser = authUsers.find((u: any) => u.id === profile.id);

      return {
        ...profile,
        email: authUser?.email,
        phone: authUser?.phone,
        // The old code used 'role' assuming it existed in profiles. We can default it or map from subscriptions
        role: userSubscriptions.length > 0 && userSubscriptions[0].plans ? userSubscriptions[0].plans.name : 'Dono de Loja',
        bars: userStores.map((store: any) => ({
          id: store.id,
          name: store.name || store.company_profile?.[0]?.company_name,
          cnpj: store.company_profile?.[0]?.cnpj,
          created_at: store.created_at
        })),
        subscriptions: userSubscriptions,
        stores: userStores // Include full store data just in case
      };
    }) || [];

    return res.status(200).json({ data: formattedProfiles });
  } catch (error: any) {
    console.error('Error fetching restaurants:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
