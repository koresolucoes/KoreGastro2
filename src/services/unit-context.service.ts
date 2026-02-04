
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
    return this.availableUnits().find(u => u.id === id)?.name || 'Loja Selecionada';
  });

  constructor() {
    // Listen for auth changes to load permissions
  }

  async loadContext(userId: string) {
    console.log('Loading unit context for user:', userId);

    // 1. Fetch stores owned by the user directly
    const { data: ownedStores, error: ownedError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', userId);

    if (ownedError) console.error('Error fetching owned stores:', ownedError);

    // 2. Fetch stores where user is a manager (delegated)
    const { data: permissions, error: permError } = await supabase
      .from('unit_permissions')
      .select('store_id, role, stores(name)')
      .eq('manager_id', userId);

    if (permError) console.error('Error fetching unit permissions:', permError);

    const unitsMap = new Map<string, { id: string, name: string, role: string }>();

    // Add Owned Stores
    if (ownedStores) {
        ownedStores.forEach(store => {
            unitsMap.set(store.id, {
                id: store.id,
                name: store.name,
                role: 'owner'
            });
        });
    }

    // Add Delegated Stores (avoid duplicates if permission also exists for owner)
    if (permissions) {
        permissions.forEach((p: any) => {
            if (!unitsMap.has(p.store_id)) {
                unitsMap.set(p.store_id, {
                    id: p.store_id,
                    name: p.stores?.name || 'Loja Compartilhada',
                    role: p.role
                });
            }
        });
    }
    
    const allUnits = Array.from(unitsMap.values());
    
    // Sort: Main store (ID=UserID) first, then others alphabetical
    allUnits.sort((a, b) => {
        if (a.id === userId) return -1;
        if (b.id === userId) return 1;
        return a.name.localeCompare(b.name);
    });

    this.availableUnits.set(allUnits);

    // 4. Restore active unit from storage or default to own unit
    const storedUnitId = localStorage.getItem(ACTIVE_UNIT_KEY);
    let targetId = storedUnitId;
    
    if (!targetId || !allUnits.some(u => u.id === targetId)) {
        // Default to the first available unit (usually the main store due to sort)
        if (allUnits.length > 0) {
            targetId = allUnits[0].id;
        } else {
            // Fallback for edge cases (should happen rarely if DB setup is correct)
            targetId = userId;
        }
    }

    // Only update if changed to prevent effect loops
    if (this.activeUnitId() !== targetId) {
        this.activeUnitId.set(targetId);
    }
  }

  setUnit(unitId: string) {
    if (this.availableUnits().some(u => u.id === unitId)) {
        if (this.activeUnitId() !== unitId) {
            this.activeUnitId.set(unitId);
            localStorage.setItem(ACTIVE_UNIT_KEY, unitId);
        }
    }
  }
}
