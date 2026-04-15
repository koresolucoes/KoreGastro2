import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SystemAdminService {
  isAdmin = signal<boolean>(false);
  isChecking = signal<boolean>(true);

  async checkAdminStatus(email: string): Promise<boolean> {
    this.isChecking.set(true);
    try {
      // Usamos uma função RPC para checar o status, ignorando o RLS e evitando loops infinitos
      const { data, error } = await supabase.rpc('is_system_admin');
      
      const hasAccess = data === true;
      this.isAdmin.set(hasAccess);
      return hasAccess;
    } catch (e) {
      this.isAdmin.set(false);
      return false;
    } finally {
      this.isChecking.set(false);
    }
  }

  async getAdmins() {
    const { data, error } = await supabase.from('system_admins').select('*').order('created_at', { ascending: true });
    return { data, error };
  }

  async addAdmin(email: string) {
    const { error } = await supabase.from('system_admins').insert([{ email }]);
    return { error };
  }

  async removeAdmin(email: string) {
    const { error } = await supabase.from('system_admins').delete().eq('email', email);
    return { error };
  }

  async getDashboardStats() {
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
    return { data, error };
  }

  async getAllRestaurants() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('/api/admin/restaurants', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch restaurants');
      }

      const result = await response.json();
      return { data: result.data, error: null };
    } catch (error: any) {
      console.error('Error fetching all restaurants via API:', error);
      return { data: null, error };
    }
  }

  async updateSubscriptionStatus(userId: string, status: string, planId?: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, status, planId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update subscription');
      }

      return { error: null };
    } catch (error: any) {
      console.error('Error updating subscription via API:', error);
      return { error };
    }
  }
}
