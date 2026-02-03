
import { Injectable, signal, computed, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';
import { UnitPermission } from '../models/db.models';

const ACTIVE_UNIT_KEY = 'chefos_active_unit';

@Injectable({
  providedIn: 'root'
})
export class UnitContextService {
  private authService = inject(AuthService);

  // Stores all accessible units for the logged in user
  // Includes their own unit (if they are an owner) and any unit delegated to them via unit_permissions
  availableUnits = signal<{ id: string, name: string, role: string }[]>([]);

  // The ID of the currently selected store context. 
  // All data queries should use this ID instead of auth.user.id
  activeUnitId = signal<string | null>(null);

  isMultiUnit = computed(() => this.availableUnits().length > 1);

  activeUnitName = computed(() => {
    const id = this.activeUnitId();
    if (!id) return '';
    return this.availableUnits().find(u => u.id === id)?.name || 'Minha Loja';
  });

  constructor() {
    // Listen for auth changes to load permissions
    // We use an effect in the AuthService or SupabaseService usually, but we can hook into the signal here
    // However, to avoid circular deps or early triggers, we expose a load method called by SupabaseStateService
  }

  async loadContext(userId: string) {
    console.log('Loading unit context for user:', userId);

    // 1. Fetch user's own profile (to act as the default store)
    const { data: myProfile } = await supabase
      .from('company_profile')
      .select('company_name')
      .eq('user_id', userId)
      .single();

    const myUnit = {
      id: userId,
      name: myProfile?.company_name || 'Minha Loja Principal',
      role: 'owner'
    };

    // 2. Fetch delegated units from unit_permissions
    // We join with company_profile to get the name of the store
    const { data: permissions, error } = await supabase
      .from('unit_permissions')
      .select('store_id, role, company_profile:company_profile!store_id(company_name)')
      .eq('manager_id', userId);

    if (error) {
      console.error('Error fetching unit permissions:', error);
    }

    const delegatedUnits = (permissions || []).map((p: any) => ({
      id: p.store_id,
      name: p.company_profile?.company_name || 'Loja Sem Nome',
      role: p.role
    }));

    const allUnits = [myUnit, ...delegatedUnits];
    this.availableUnits.set(allUnits);

    // 3. Restore active unit from storage or default to own unit
    const storedUnitId = localStorage.getItem(ACTIVE_UNIT_KEY);
    
    if (storedUnitId && allUnits.some(u => u.id === storedUnitId)) {
        this.activeUnitId.set(storedUnitId);
    } else {
        // Default to the user's own unit if valid, otherwise the first available
        this.activeUnitId.set(allUnits[0]?.id || userId);
    }
  }

  setUnit(unitId: string) {
    if (this.availableUnits().some(u => u.id === unitId)) {
        this.activeUnitId.set(unitId);
        localStorage.setItem(ACTIVE_UNIT_KEY, unitId);
        // Reloading the page or triggering a data refresh is usually required here.
        // The SupabaseStateService effect should catch the signal change if configured correctly,
        // or we can reload the window to be safe and ensure a clean state.
        window.location.reload(); 
    }
  }
}
