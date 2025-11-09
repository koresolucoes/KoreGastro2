import { Injectable, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { DeliveryDriver } from '../models/db.models';

@Injectable({ providedIn: 'root' })
export class DeliveryDataService {
  private authService = inject(AuthService);

  async updateDeliveryStatus(orderId: string, status: string, driverId?: string | null) {
    const updatePayload: { delivery_status: string; delivery_driver_id?: string | null } = {
      delivery_status: status,
    };
    if (driverId !== undefined) {
      updatePayload.delivery_driver_id = driverId;
    }
    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);
    return { success: !error, error };
  }
  
  async addDriver(driver: Partial<DeliveryDriver>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' }};
    const { error } = await supabase.from('delivery_drivers').insert({ ...driver, user_id: userId });
    return { success: !error, error };
  }

  async updateDriver(driverId: string, updates: Partial<DeliveryDriver>): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('delivery_drivers').update(updates).eq('id', driverId);
    return { success: !error, error };
  }
}
