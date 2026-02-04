
import { Injectable, inject } from '@angular/core';
import { Employee, Station, CompanyProfile, Role, Customer, Order, LoyaltySettings, LoyaltyReward, LoyaltyMovement, Webhook, WebhookEvent } from '../models/db.models';
import { StoreManager } from '../models/app.models';
import { AuthService } from './auth.service';
import { supabase } from './supabase-client';
import { ALL_PERMISSION_KEYS } from '../config/permissions';
import { v4 as uuidv4 } from 'uuid';
import { WebhookService } from './webhook.service';
import { UnitContextService } from './unit-context.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsDataService {
  private authService = inject(AuthService);
  private webhookService = inject(WebhookService);
  private unitContextService = inject(UnitContextService);

  private getActiveUnitId(): string | null {
      return this.unitContextService.activeUnitId();
  }

  private async uploadAsset(file: File, path: string): Promise<{ publicUrl: string | null; error: any }> {
    const { error: uploadError } = await supabase.storage
      .from('restaurant_assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      return { publicUrl: null, error: uploadError };
    }

    const { data } = supabase.storage
      .from('restaurant_assets')
      .getPublicUrl(path);

    return { publicUrl: data.publicUrl, error: null };
  }

  // --- Multi-Unit / Team Management RPCs ---
  
  // Creates a new store (Needs AUTH user because it creates a new context)
  async createNewStore(storeName: string): Promise<{ success: boolean; message?: string; store_id?: string }> {
      const { data, error } = await supabase.rpc('create_new_store', { store_name: storeName });
      
      if (error) {
          return { success: false, message: error.message };
      }
      
      const response = data as { success: boolean; message?: string; store_id?: string };
      return response;
  }
  
  async deleteStore(storeId: string): Promise<{ success: boolean; message?: string }> {
      const { data, error } = await supabase.rpc('delete_store', { target_store_id: storeId });
      if (error) {
          return { success: false, message: error.message };
      }
      return data as { success: boolean; message?: string };
  }

  async getStoreManagers(): Promise<{ data: StoreManager[]; error: any }> {
    // Fetches managers for the CURRENT context (the store currently active)
    // IMPORTANT: The backend RPC 'get_store_managers' currently uses auth.uid() as the filter.
    // If we want managers for the ACTIVE unit (which might be different if I am a manager there),
    // we need to adjust. However, standard flow is: Owner logs in -> Selects Store -> manages permissions.
    // If the active unit ID != auth.uid() (delegated access), the current user might not have permission to list managers depending on role.
    
    // For now, assuming Owner context for management.
    const { data, error } = await supabase.rpc('get_store_managers');
    return { data: data as StoreManager[] || [], error };
  }

  async inviteManager(email: string, role: string): Promise<{ success: boolean; message: string }> {
    // Same note as above. Invites are for the store owned by auth.uid().
    const { data, error } = await supabase.rpc('invite_manager_by_email', { 
        email_input: email, 
        role_input: role 
    });
    
    if (error) {
        return { success: false, message: error.message };
    }
    return data as { success: boolean; message: string };
  }

  async removeManager(permissionId: string): Promise<{ success: boolean; error: any }> {
    const { data, error } = await supabase.rpc('remove_store_manager', { permission_id_input: permissionId });
    return { success: data as boolean, error };
  }

  async addStation(name: string): Promise<{ success: boolean; error: any; data?: Station }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
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

  async addEmployee(employee: Partial<Employee>, photoFile?: File | null): Promise<{ success: boolean, error: any, data?: Employee }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
    const { photo_url, ...employeeData } = employee;
    const { data: newEmployee, error } = await supabase.from('employees').insert({ ...employeeData, user_id: userId }).select().single();
    if (error) return { success: false, error, data: undefined };

    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop();
      const path = `public/employee_photos/${newEmployee.id}.${fileExt}`;
      const { publicUrl, error: uploadError } = await this.uploadAsset(photoFile, path);

      if (uploadError) {
        console.error('Employee created, but photo upload failed:', uploadError);
        return { success: true, error: null, data: newEmployee };
      }

      const { data: updatedEmployee, error: updateError } = await supabase.from('employees').update({ photo_url: publicUrl }).eq('id', newEmployee.id).select().single();
      if (updateError) {
        console.error('Employee created and photo uploaded, but updating record failed:', updateError);
        return { success: true, error: null, data: newEmployee };
      }
      return { success: true, error: null, data: updatedEmployee };
    }

    return { success: true, error: null, data: newEmployee };
  }

  async updateEmployee(employee: Partial<Employee>, photoFile?: File | null): Promise<{ success: boolean, error: any }> {
    const { id, ...updateData } = employee;

    if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const path = `public/employee_photos/${id}.${fileExt}`;
        const { publicUrl, error: uploadError } = await this.uploadAsset(photoFile, path);
        if (uploadError) {
            return { success: false, error: uploadError };
        }
        updateData.photo_url = publicUrl;
    }

    const { error } = await supabase.from('employees').update(updateData).eq('id', id!);
    return { success: !error, error };
  }

  async deleteEmployee(id: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async updateCompanyProfile(profile: Partial<CompanyProfile>, logoFile?: File | null, coverFile?: File | null, headerFile?: File | null): Promise<{ success: boolean, error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };

    const profileData = { ...profile };

    if (logoFile) {
      const fileExt = logoFile.name.split('.').pop();
      const path = `public/logos/${userId}-logo.${fileExt}`;
      const { publicUrl, error: uploadError } = await this.uploadAsset(logoFile, path);
      if (uploadError) return { success: false, error: uploadError };
      profileData.logo_url = publicUrl;
    }

    if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const path = `public/covers/${userId}-cover.${fileExt}`;
        const { publicUrl, error: uploadError } = await this.uploadAsset(coverFile, path);
        if (uploadError) return { success: false, error: uploadError };
        profileData.menu_cover_url = publicUrl;
    }

    if (headerFile) {
        const fileExt = headerFile.name.split('.').pop();
        const path = `public/headers/${userId}-header.${fileExt}`;
        const { publicUrl, error: uploadError } = await this.uploadAsset(headerFile, path);
        if (uploadError) return { success: false, error: uploadError };
        profileData.menu_header_url = publicUrl;
    }

    const { error } = await supabase
      .from('company_profile')
      .upsert({ ...profileData, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  async regenerateExternalApiKey(): Promise<{ success: boolean; error: any; data: { external_api_key: string } | null }> {
    // This RPC likely updates the 'auth.uid()' profile. 
    // In multi-store, we should ensure it updates the active unit profile if possible.
    // If the RPC relies strictly on auth.uid(), it might only work for the owner.
    // For now, assume owner context.
    const { data, error } = await supabase.rpc('regenerate_external_api_key');
    if (error) {
      return { success: false, error, data: null };
    }
    return { success: true, error: null, data: { external_api_key: data } };
  }

  async updateFocusNFeToken(token: string, validUntil: string | null): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { error } = await supabase
      .from('company_profile')
      .update({ focusnfe_token: token, focusnfe_cert_valid_until: validUntil })
      .eq('user_id', userId);
    return { success: !error, error };
  }

  async addRole(name: string): Promise<{ success: boolean, error: any, data?: Role }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { data, error } = await supabase.from('roles').insert({ name, user_id: userId }).select().single();
    return { success: !error, error, data };
  }

  async updateRole(id: string, name: string): Promise<{ success: boolean, error: any }> {
    const { error } = await supabase.from('roles').update({ name }).eq('id', id);
    return { success: !error, error };
  }

  async deleteRole(id: string): Promise<{ success: boolean, error: any }> {
    await supabase.from('role_permissions').delete().eq('role_id', id);
    const { error } = await supabase.from('roles').delete().eq('id', id);
    return { success: !error, error };
  }
  
  async updateRolePermissions(roleId: string, permissions: string[], callerRoleId: string): Promise<{ success: boolean, error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
    if (roleId !== callerRoleId) {
      const { data: callerPermissionsData, error: fetchError } = await supabase
        .from('role_permissions')
        .select('permission_key')
        .eq('role_id', callerRoleId);
        
      if (fetchError) {
        return { success: false, error: fetchError };
      }

      const callerPermissionsSet = new Set((callerPermissionsData || []).map(p => p.permission_key));
      const canGrantAll = permissions.every(p => callerPermissionsSet.has(p));

      if (!canGrantAll) {
        return { success: false, error: { message: 'Ação não permitida. Você não pode conceder a outros uma permissão que você não possui.' } };
      }
    }

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
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    
    const permissionsToInsert = ALL_PERMISSION_KEYS.map(key => ({
      role_id: roleId,
      permission_key: key,
      user_id: userId
    }));

    await supabase.from('role_permissions').delete().eq('role_id', roleId);
    const { error } = await supabase.from('role_permissions').insert(permissionsToInsert);
    return { success: !error, error };
  }
  
  async addCustomer(customer: Partial<Customer>): Promise<{ success: boolean; error: any; data?: Customer }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { data, error } = await supabase.from('customers').insert({ ...customer, user_id: userId }).select().single();
    
    if (data) {
        this.webhookService.triggerWebhook('customer.created', data);
    }
    
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
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false });
  }

  async upsertLoyaltySettings(settings: Partial<LoyaltySettings>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
    const { error } = await supabase
      .from('loyalty_settings')
      .upsert({ ...settings, user_id: userId }, { onConflict: 'user_id' });
    return { success: !error, error };
  }

  async addLoyaltyReward(reward: Partial<LoyaltyReward>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { success: false, error: { message: 'Active unit not found' } };
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
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase
      .from('loyalty_movements')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
  }
  
  async getWebhooks(): Promise<{ data: Webhook[] | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };

    return supabase.from('webhooks').select('*').eq('user_id', userId).order('created_at');
  }

  async addWebhook(url: string, events: WebhookEvent[]): Promise<{ data: Webhook & { secret: string } | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId) return { data: null, error: { message: 'Active unit not found' } };
    
    const secret = `whsec_${uuidv4().replace(/-/g, '')}`;
    
    const { data, error } = await supabase
        .from('webhooks')
        .insert({
            url,
            events,
            secret,
            user_id: userId,
            is_active: true
        })
        .select()
        .single();
        
    return { data, error };
  }
  
  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<{ success: boolean; error: any }> {
    const { id: webhookId, user_id, created_at, secret, ...updateData } = updates;
    const { error } = await supabase.from('webhooks').update(updateData).eq('id', id);
    return { success: !error, error };
  }

  async deleteWebhook(id: string): Promise<{ success: boolean; error: any }> {
    const { error } = await supabase.from('webhooks').delete().eq('id', id);
    return { success: !error, error };
  }
}
