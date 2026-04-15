import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const { userId, status, planId } = req.body;

    if (!userId || !status) {
      return res.status(400).json({ error: 'Missing required fields: userId, status' });
    }

    // Check if subscription exists
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .single();

    let result;

    if (existingSub) {
      // Update existing
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (planId) updateData.plan_id = planId;
      
      // If activating, extend period end by 30 days
      if (status === 'active') {
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        updateData.current_period_end = nextMonth.toISOString();
      }

      result = await supabaseAdmin
        .from('subscriptions')
        .update(updateData)
        .eq('id', existingSub.id);
    } else {
      // Create new
      let finalPlanId = planId;
      if (!finalPlanId || finalPlanId === '00000000-0000-0000-0000-000000000000') {
        // Fetch the first available plan
        const { data: defaultPlan } = await supabaseAdmin
          .from('plans')
          .select('id')
          .limit(1)
          .single();
          
        if (defaultPlan) {
          finalPlanId = defaultPlan.id;
        } else {
          return res.status(400).json({ error: 'No plans available in the database to assign' });
        }
      }

      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);

      result = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: finalPlanId,
          status,
          current_period_end: nextMonth.toISOString()
        });
    }

    if (result.error) {
      throw result.error;
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
