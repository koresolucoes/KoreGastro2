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

  async getPlans() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });
      return { data, error };
    } catch (error: any) {
      console.error('Error fetching plans:', error);
      return { data: null, error };
    }
  }

  async updateSubscriptionStatus(userId: string, status: string, planId?: string, currentPeriodEnd?: string) {
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
        body: JSON.stringify({ userId, status, planId, currentPeriodEnd })
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

  async getSystemHealth() {
    try {
      const response = await fetch('/api/v2/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return await response.json();
    } catch (error: any) {
      console.error('Error fetching system health:', error);
      return {
        status: 'unhealthy',
        latencyMs: 0,
        checks: {
          database: { status: 'error', message: 'API unreachable' }
        },
        system: { uptimeSeconds: 0, memoryUsageMB: 0 }
      };
    }
  }

  async provisionTenant(data: {
    userId: string;
    storeName: string;
    ownerEmail?: string;
    cnpj?: string;
    phone?: string;
    address?: string;
    planId?: string;
  }) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/v2/admin/provision-tenant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Falha ao provisionar tenant');
      }
      return { data: result, error: null };
    } catch (error: any) {
      console.error('Error provisioning tenant:', error);
      return { data: null, error };
    }
  }

  async createPlan(plan: { name: string; slug: string; price: number; trial_period_days: number; max_stores: number }) {
    try {
      const { data, error } = await supabase
        .from('plans')
        .insert([plan])
        .select()
        .single();
      return { data, error };
    } catch (error: any) {
      return { data: null, error };
    }
  }

  async updatePlan(planId: string, plan: Partial<{ name: string; slug: string; price: number; trial_period_days: number; max_stores: number }>) {
    try {
      const { data, error } = await supabase
        .from('plans')
        .update(plan)
        .eq('id', planId)
        .select()
        .single();
      return { data, error };
    } catch (error: any) {
      return { data: null, error };
    }
  }

  async deletePlan(planId: string) {
    try {
      const { error } = await supabase
        .from('plans')
        .delete()
        .eq('id', planId);
      return { error };
    } catch (error: any) {
      return { error };
    }
  }

  async getSystemLogs() {
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      return { data, error };
    } catch (error: any) {
      return { data: null, error };
    }
  }

  // --- CENTRAL DE ATENDIMENTO AO CLIENTE EM TEMPO REAL ---
  private supportTickets = signal<any[]>([]);

  getSupportTickets() {
    return this.supportTickets();
  }

  addSupportTicket(ticket: any) {
    const current = this.supportTickets();
    this.supportTickets.set([ticket, ...current]);
  }

  sendTicketReply(ticketId: string, replyText: string, newStatus?: string) {
    const current = this.supportTickets();
    const updated = current.map(t => {
      if (t.id === ticketId) {
        const msgs = [...t.messages, { sender: 'admin', text: replyText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
        return {
          ...t,
          status: newStatus || 'in_progress',
          messages: msgs,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });
    this.supportTickets.set(updated);
  }

  updateTicketStatus(ticketId: string, status: string) {
    const current = this.supportTickets();
    this.supportTickets.set(current.map(t => t.id === ticketId ? { ...t, status } : t));
  }

  async getTenantMenu(tenantId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/v2/admin/tenant-menu?tenantId=${tenantId}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const result = await response.json();
      const items = result.data || [];
      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        category: item.categories?.name || 'Geral',
        price: item.price,
        is_available: item.is_available,
        prep_time: item.prep_time_in_minutes || 15
      }));
    } catch (error) {
      console.error('Error fetching tenant menu:', error);
      return [];
    }
  }

  async updateTenantMenuItem(tenantId: string, itemId: string, updates: Partial<{ name: string; price: number; is_available: boolean; category: string }>) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/v2/admin/tenant-menu', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: itemId, updates })
      });
    } catch (error) {
      console.error('Error updating tenant menu item:', error);
    }
  }

  async addTenantMenuItem(tenantId: string, item: { name: string; category: string; price: number; is_available?: boolean }) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/v2/admin/tenant-menu', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tenantId, item })
      });
    } catch (error) {
      console.error('Error adding tenant menu item:', error);
    }
  }
}
