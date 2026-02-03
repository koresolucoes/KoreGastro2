
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
  }

  async loadContext(userId: string) {
    console.log('Loading unit context for user:', userId);

    // 1. Fetch delegated units from unit_permissions
    const { data: permissions, error } = await supabase
      .from('unit_permissions')
      .select('store_id, role')
      .eq('manager_id', userId);

    if (error) {
      console.error('Error fetching unit permissions:', error);
    }

    const delegatedStoreIds = (permissions || []).map((p: any) => p.store_id);
    const allStoreIds = Array.from(new Set([userId, ...delegatedStoreIds]));

    // 2. Fetch profiles for all accessible stores (Own + Delegated)
    const { data: profiles, error: profilesError } = await supabase
      .from('company_profile')
      .select('user_id, company_name')
      .in('user_id', allStoreIds);

    if (profilesError) {
        console.error('Error fetching store profiles:', profilesError);
    }

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.company_name]));

    // 3. Build the units list
    const myUnit = {
      id: userId,
      name: profileMap.get(userId) || 'Minha Loja Principal',
      role: 'owner'
    };

    const delegatedUnits = (permissions || []).map((p: any) => ({
      id: p.store_id,
      name: profileMap.get(p.store_id) || 'Loja Sem Nome',
      role: p.role
    }));

    // Ensure uniqueness
    const unitsMap = new Map();
    unitsMap.set(myUnit.id, myUnit);
    delegatedUnits.forEach(u => unitsMap.set(u.id, u));
    
    const allUnits = Array.from(unitsMap.values());
    this.availableUnits.set(allUnits);

    // 4. Restore active unit from storage or default to own unit
    const storedUnitId = localStorage.getItem(ACTIVE_UNIT_KEY);
    
    if (storedUnitId && allUnits.some(u => u.id === storedUnitId)) {
        this.activeUnitId.set(storedUnitId);
    } else {
        // Default to the user's own unit
        this.activeUnitId.set(userId);
    }
  }

  setUnit(unitId: string) {
    if (this.availableUnits().some(u => u.id === unitId)) {
        this.activeUnitId.set(unitId);
        localStorage.setItem(ACTIVE_UNIT_KEY, unitId);
        // Force a hard reload to ensure all services and subscriptions reset cleanly with the new ID
        window.location.reload(); 
    }
  }
}
