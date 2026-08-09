import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { OperationsDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';

@Injectable({
  providedIn: 'root'
})
export class OperationsDataLoaderService {
  public async load(userId: string): Promise<OperationsDataLoadResult> {
    const [
      deliveryDriversRes,
      loyaltySettingsRes, 
      loyaltyRewardsRes, 
      reservationSettingsRes, 
      paymentTerminalsRes,
      ifoodWebhookLogsRes
    ] = await Promise.all([
      supabase.from('delivery_drivers').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('loyalty_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('loyalty_rewards').select('*').eq('user_id', userId).order('points_cost', { ascending: true }),
      supabase.from('reservation_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('payment_terminals').select('*').eq('user_id', userId).eq('is_active', true),
      // Webhook logs for realtime ifood status
      supabase.from('ifood_webhook_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    ]);

    const deliveryDrivers = assertCriticalDataResult(deliveryDriversRes, 'delivery_drivers') || [];
    
    const loyaltySettings = extractOptionalDataResult(loyaltySettingsRes, 'loyalty_settings', null);
    const loyaltyRewards = extractOptionalDataResult(loyaltyRewardsRes, 'loyalty_rewards', []);
    const reservationSettings = extractOptionalDataResult(reservationSettingsRes, 'reservation_settings', null);
    const paymentTerminals = extractOptionalDataResult(paymentTerminalsRes, 'payment_terminals', []);
    const ifoodWebhookLogs = extractOptionalDataResult(ifoodWebhookLogsRes, 'ifood_webhook_logs', []);

    return {
      deliveryDrivers,
      loyaltySettings,
      loyaltyRewards,
      reservationSettings,
      paymentTerminals,
      ifoodWebhookLogs
    };
  }
}
