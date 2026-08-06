
import { Injectable, signal, computed, inject } from '@angular/core';
import { supabase } from './supabase-client';
import { AuthService } from './auth.service';

const ACTIVE_UNIT_KEY = 'chefos_active_unit';

export interface UnitInfo {
  id: string;
  name: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class UnitContextService {
  private authService = inject(AuthService);

  // Default initial stores so the unit selector is always operational
  availableUnits = signal<UnitInfo[]>([]);
  activeUnitId = signal<string>('');

  isMultiUnit = computed(() => this.availableUnits().length > 1);

  activeUnitName = computed(() => {
    const id = this.activeUnitId();
    if (!id) return 'Unidade Principal';
    const found = this.availableUnits().find(u => u.id === id);
    return found ? found.name : 'Unidade Principal';
  });

  constructor() {
    const stored = localStorage.getItem(ACTIVE_UNIT_KEY);
    // Simple UUID regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (stored && uuidRegex.test(stored)) {
      this.activeUnitId.set(stored);
    } else {
      localStorage.removeItem(ACTIVE_UNIT_KEY);
    }
  }

  async loadContext(userId: string) {
    const { data: ownedStores, error: ownedError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', userId);

    if (ownedError) console.error('Error fetching owned stores:', ownedError);

    const { data: permissions, error: permError } = await supabase
      .from('unit_permissions')
      .select('store_id, role, stores(name)')
      .eq('manager_id', userId);

    if (permError) console.error('Error fetching unit permissions:', permError);

    const unitsMap = new Map<string, UnitInfo>();

    if (ownedStores && ownedStores.length > 0) {
      ownedStores.forEach(store => {
        unitsMap.set(store.id, {
          id: store.id,
          name: store.name,
          role: 'owner'
        });
      });
    }

    if (permissions && permissions.length > 0) {
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

    let allUnits = Array.from(unitsMap.values());

    if (allUnits.length === 0) {
      allUnits = [
        { id: userId, name: 'Unidade Principal', role: 'owner' }
      ];
    }

    this.availableUnits.set(allUnits);

    const storedUnitId = localStorage.getItem(ACTIVE_UNIT_KEY);
    let targetId = storedUnitId;
    if (!targetId || !allUnits.some(u => u.id === targetId)) {
      targetId = allUnits[0].id;
    }

    this.activeUnitId.set(targetId);
    localStorage.setItem(ACTIVE_UNIT_KEY, targetId);
  }

  setUnit(unitId: string) {
    this.activeUnitId.set(unitId);
    localStorage.setItem(ACTIVE_UNIT_KEY, unitId);
  }
}
