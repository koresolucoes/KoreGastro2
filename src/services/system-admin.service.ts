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
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        avatar_url,
        role,
        updated_at,
        bars (
          id,
          name,
          created_at
        )
      `)
      .order('updated_at', { ascending: false });
    return { data, error };
  }
}
