import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

/**
 * ChefOS Automated Tenant Provisioning Service Endpoint
 * Creates store profile, initial subscription, default permissions, default settings & API keys
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, storeName, ownerEmail, cnpj, phone, address, planId } = req.body;

    if (!userId || !storeName) {
      return res.status(400).json({ error: 'Missing required parameters: userId and storeName are required.' });
    }

    console.log(`[Provisioning] Starting automated tenant creation for user: ${userId}, Store: ${storeName}`);

    // 1. Generate or verify store record
    const { data: existingStore } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle();

    let storeId = existingStore?.id;

    if (!existingStore) {
      const { data: newStore, error: createStoreError } = await supabaseAdmin
        .from('stores')
        .insert({
          owner_id: userId,
          name: storeName,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createStoreError) {
        console.error('[Provisioning Error] Creating store failed:', createStoreError);
        throw new Error(`Failed to create store: ${createStoreError.message}`);
      }
      storeId = newStore.id;
    }

    // 2. Provision or update Company Profile & Generate External API Key for V2 REST API
    const apiKey = `chefos_live_${uuidv4().replace(/-/g, '')}`;
    
    const { error: profileError } = await supabaseAdmin
      .from('company_profile')
      .upsert({
        user_id: userId,
        company_name: storeName,
        cnpj: cnpj || '',
        phone: phone || '',
        address: address || '',
        external_api_key: apiKey,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.warn('[Provisioning Warning] Company profile setup notice:', profileError.message);
    }

    // 3. Provision Default Subscription (30-day trial or specified plan)
    let selectedPlanId = planId;

    if (!selectedPlanId) {
      const { data: defaultPlan } = await supabaseAdmin
        .from('plans')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      selectedPlanId = defaultPlan?.id || '00000000-0000-0000-0000-000000000000';
    }

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        plan_id: selectedPlanId,
        status: 'trialing',
        current_period_end: trialEndDate.toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (subError) {
      console.warn('[Provisioning Warning] Subscription setup notice:', subError.message);
    }

    // 4. Provision Default Store Configuration (Halls & Tables layout if empty)
    const { data: existingHalls } = await supabaseAdmin
      .from('halls')
      .select('id')
      .eq('user_id', userId);

    if (!existingHalls || existingHalls.length === 0) {
      const { data: defaultHall } = await supabaseAdmin
        .from('halls')
        .insert({
          user_id: userId,
          name: 'Salão Principal',
          is_default: true,
          created_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

      if (defaultHall) {
        // Create 6 default tables
        const defaultTables = Array.from({ length: 6 }, (_, i) => ({
          user_id: userId,
          hall_id: defaultHall.id,
          number: i + 1,
          name: `Mesa ${i + 1}`,
          capacity: 4,
          status: 'available'
        }));

        await supabaseAdmin.from('tables').insert(defaultTables);
      }
    }

    // 5. Provision Default Unit Permissions for Store Manager Role
    await supabaseAdmin
      .from('unit_permissions')
      .upsert({
        manager_id: userId,
        store_id: storeId,
        role: 'owner',
      }, { onConflict: 'manager_id, store_id' });

    console.log(`[Provisioning Complete] Tenant successfully provisioned: ${storeId}`);

    return res.status(200).json({
      success: true,
      message: 'Tenant provisioned successfully',
      tenant: {
        userId,
        storeId,
        storeName,
        apiKey,
        subscription: {
          planId: selectedPlanId,
          status: 'trialing',
          trialEndsAt: trialEndDate.toISOString()
        },
        provisionedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[Provisioning Error]', error);
    return res.status(500).json({ error: error.message || 'Failed to provision tenant' });
  }
}
