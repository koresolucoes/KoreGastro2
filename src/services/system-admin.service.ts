import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase-client';
import { environment } from '../config/environment';

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

  private async ifoodRequest(payload: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sessão administrativa ausente.');
    const response = await fetch(environment.apiBaseUrl + '/api/ifood-integration-requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível atualizar os pedidos iFood.');
    return result;
  }

  async getIfoodIntegrationRequests() {
    try {
      const result = await this.ifoodRequest({ action: 'adminList' });
      return { data: result.requests || [], error: null };
    } catch (error) {
      console.error('Erro ao carregar pedidos iFood:', error);
      return { data: null, error };
    }
  }

  async updateIfoodIntegrationRequest(requestId: string, status: string, message?: string) {
    try {
      await this.ifoodRequest({ action: 'adminUpdate', requestId, status, message });
      return { error: null };
    } catch (error) {
      console.error('Erro ao atualizar pedido iFood:', error);
      return { error };
    }
  }

  async connectIfoodIntegrationRequest(requestId: string, merchantId: string) {
    try {
      await this.ifoodRequest({ action: 'adminConnect', requestId, merchantId });
      return { error: null };
    } catch (error) {
      console.error('Erro ao confirmar conexão iFood:', error);
      return { error };
    }
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

      const response = await fetch('/api/v2/admin/restaurants', {
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

      const response = await fetch('/api/v2/admin/subscriptions', {
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
