
import { Injectable, inject } from '@angular/core';
// FIX: Add Customer model to imports
import { Employee, Station, CompanyProfile, Role, Customer, Order, LoyaltySettings, LoyaltyReward, LoyaltyMovement } from '../models/db.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { ALL_PERMISSION_KEYS } from '../config/permissions';

@Injectable({
  providedIn: 'root',
})
export class SettingsDataService {
  private authService = inject(AuthService);

  // FIX: Updated method to return the created station object.
  async addStation(name: string): Promise<{ success: boolean; error: any; data?: Station }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('stations').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateStation(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteStation(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('stations').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async assignEmployeeToStation(stationId: string, employeeId: string | null): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('stations').update({ employee_id: employeeId }).eq('id', stationId);
    return { success: !error, error };
  }

  async addEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any, data?: Employee }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('employees').insert({ ...employee, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateEmployee(employee: Partial<Employee>): Promise<{ success: boolean, error: any }> {
    const { id, ...updateData } = employee;
    const { error } = await supabase.from('employees').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteEmployee(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async updateCompanyProfile(profile: Partial<CompanyProfile>): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase
      .from('company_profile')
      .upsert({ ...profile, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  // --- Roles and Permissions ---
  async addRole(name: string): Promise<{ success: boolean, error: any, data?: Role }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('roles').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateRole(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('roles').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRole(id: string): Promise<{ success: boolean, error: any }> {
    // We need to delete permissions first due to foreign key constraints
    await supabase.from('role_permissions').delete().eq('role_id', id);
    const { error } = await supabase.from('roles').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async updateRolePermissions(roleId: string, permissions: string[]): Promise<{ success: boolean, error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    // Simple approach: delete all existing and insert new ones.
    // For large scale, an RPC function would be better.
    const { error: deleteError } = await supabase.from('role_permissions').delete().eq('role_id', roleId);
    if (deleteError) return { success: false, error: deleteError };

    if (permissions.length > 0) {
      const permissionsToInsert = permissions.map(key => ({
        role_id: roleId,
        permission_key: key,
        user_id: userId
      }));
      const { error: insertError } = await supabase.from('role_permissions').insert(permissionsToInsert);
      if (insertError) return { success: false, error: insertError };
    }
    
    return { success: true, error: null };
  }

  async grantAllPermissionsToRole(roleId: string): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    
    const permissionsToInsert = ALL_PERMISSION_KEYS.map(key => ({
      role_id: roleId,
      permission_key: key,
      user_id: userId
    }));

    await supabase.from('role_permissions').delete().eq('role_id', roleId);

    const { error } = await supabase.from('role_permissions').insert(permissionsToInsert);
    
    return { success: !error, error };
  }
  
  // FIX: Add methods to manage customer data.
  async addCustomer(customer: Partial<Customer>): Promise<{ success: boolean; error: any; data?: Customer }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { data, error } = await supabase.from('customers').insert({ ...customer, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateCustomer(customer: Partial<Customer>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = customer;
    const { error } = await supabase.from('customers').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteCustomer(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    return { success: !error, error };
  }

  async getConsumptionHistory(customerId: string): Promise<{ data: Order[] | null; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    return supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .eq('is_completed', true)
      .order('completed_at', { ascending: false });
  }

  // --- Loyalty Program ---
  async upsertLoyaltySettings(settings: Partial<LoyaltySettings>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase
      .from('loyalty_settings')
      .upsert({ ...settings, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  async addLoyaltyReward(reward: Partial<LoyaltyReward>): Promise<{ success: boolean; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { success: false, error: { message: 'User not authenticated' } };
    const { error } = await supabase.from('loyalty_rewards').insert({ ...reward, user_id: userId });
    return { success: !error, error };
  }

  async updateLoyaltyReward(reward: Partial<LoyaltyReward>): Promise<{ success: boolean; error: any }> {
    const { id, ...updateData } = reward;
    const { error } = await supabase.from('loyalty_rewards').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteLoyaltyReward(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
    return { success: !error, error };
  }

  async getLoyaltyMovements(customerId: string): Promise<{ data: LoyaltyMovement[] | null; error: any }> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return { data: null, error: { message: 'User not authenticated' } };

    return supabase
      .from('loyalty_movements')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
  }
}
