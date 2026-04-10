import { Injectable, inject } from '@angular/core';
import { UnitContextService } from './unit-context.service';
import { ChecklistTemplate, ChecklistLog, Equipment, TemperatureLog } from '../models/db.models';
import { supabase } from './supabase-client';

@Injectable({
  providedIn: 'root'
})
export class OperationalService {
  private unitContext = inject(UnitContextService);

  get supabase() {
    return supabase;
  }

  // --- Equipment ---
  async getEquipment(): Promise<Equipment[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    const { data, error } = await this.supabase
      .from('equipment')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching equipment:', error);
      return [];
    }
    return data || [];
  }

  async addEquipment(equipment: Partial<Equipment>): Promise<Equipment | null> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return null;

    const { data, error } = await this.supabase
      .from('equipment')
      .insert({ ...equipment, store_id: storeId })
      .select()
      .single();

    if (error) {
      console.error('Error adding equipment:', error);
      return null;
    }
    return data;
  }

  // --- Temperature Logs ---
  async getRecentTemperatureLogs(limit = 50): Promise<TemperatureLog[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    const { data, error } = await this.supabase
      .from('temperature_logs')
      .select(`
        *,
        equipment (name, min_temp, max_temp),
        employees (name)
      `)
      .eq('store_id', storeId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching temperature logs:', error);
      return [];
    }
    return data || [];
  }

  async logTemperature(log: Partial<TemperatureLog>): Promise<TemperatureLog | null> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return null;

    const { data, error } = await this.supabase
      .from('temperature_logs')
      .insert({ ...log, store_id: storeId })
      .select()
      .single();

    if (error) {
      console.error('Error logging temperature:', error);
      return null;
    }
    return data;
  }

  // --- Checklist Templates ---
  async getChecklistTemplates(section?: string): Promise<ChecklistTemplate[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    let query = this.supabase
      .from('checklist_templates')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('section')
      .order('checklist_type');

    if (section) {
      query = query.eq('section', section);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checklist templates:', error);
      return [];
    }
    return data || [];
  }

  async addChecklistTemplate(template: Partial<ChecklistTemplate>): Promise<ChecklistTemplate | null> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return null;

    const { data, error } = await this.supabase
      .from('checklist_templates')
      .insert({ ...template, store_id: storeId })
      .select()
      .single();

    if (error) {
      console.error('Error adding checklist template:', error);
      return null;
    }
    return data;
  }

  // --- Checklist Logs ---
  async getRecentChecklistLogs(limit = 100): Promise<ChecklistLog[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    const { data, error } = await this.supabase
      .from('checklist_logs')
      .select(`
        *,
        checklist_templates (*),
        employees (name)
      `)
      .eq('store_id', storeId)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching checklist logs:', error);
      return [];
    }
    return data || [];
  }

  async logChecklistTask(log: Partial<ChecklistLog>): Promise<ChecklistLog | null> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return null;

    const { data, error } = await this.supabase
      .from('checklist_logs')
      .insert({ ...log, store_id: storeId })
      .select()
      .single();

    if (error) {
      console.error('Error logging checklist task:', error);
      return null;
    }
    return data;
  }
}
