import { Injectable, inject } from '@angular/core';
import { UnitContextService } from './unit-context.service';
import { ChecklistTemplate, ChecklistLog, Equipment, TemperatureLog } from '../models/db.models';
import { supabase } from './supabase-client';

import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class OperationalService {
  private unitContext = inject(UnitContextService);
  private notificationService = inject(NotificationService);

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
  async getRecentTemperatureLogs(limit: number | null = 50, startDate?: string, endDate?: string, equipmentId?: string, statusFilter?: 'all' | 'out_of_standard'): Promise<TemperatureLog[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    let query = this.supabase
      .from('temperature_logs')
      .select(`
        *,
        equipment (name, min_temp, max_temp),
        employees (name)
      `)
      .eq('store_id', storeId)
      .order('recorded_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }
    if (startDate) {
      query = query.gte('recorded_at', startDate + 'T00:00:00.000Z');
    }
    if (endDate) {
      query = query.lte('recorded_at', endDate + 'T23:59:59.999Z');
    }
    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching temperature logs:', error);
      return [];
    }
    
    let result = (data || []) as any[];
    if (statusFilter === 'out_of_standard') {
       result = result.filter(log => {
          const eq = log.equipment;
          if (!eq) return false;
          const temp = log.temperature;
          return (eq.min_temp !== null && temp < eq.min_temp) || (eq.max_temp !== null && temp > eq.max_temp);
       });
    }

    return result;
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

  async uploadOperationalImage(file: File, folder: 'checklists' | 'temperatures'): Promise<string | null> {
      const storeId = this.unitContext.activeUnitId();
      if (!storeId) return null;
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${storeId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data, error } = await this.supabase.storage
          .from('operational_images')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });
          
      if (error) {
          console.error(`Error uploading image to ${folder}:`, error);
          this.notificationService.show('Erro ao fazer upload da imagem.', 'error');
          return null;
      }
      
      const { data: publicUrlData } = this.supabase.storage
          .from('operational_images')
          .getPublicUrl(fileName);
          
      return publicUrlData.publicUrl;
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
  async getRecentChecklistLogs(limit: number | null = 100, startDate?: string, endDate?: string, section?: string, statusFilter?: 'all' | 'completed' | 'issue'): Promise<ChecklistLog[]> {
    const storeId = this.unitContext.activeUnitId();
    if (!storeId) return [];

    let query = this.supabase
      .from('checklist_logs')
      .select(`
        *,
        checklist_templates (*),
        employees (name)
      `)
      .eq('store_id', storeId)
      .order('completed_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }
    if (startDate) {
      query = query.gte('completed_at', startDate + 'T00:00:00.000Z');
    }
    if (endDate) {
      query = query.lte('completed_at', endDate + 'T23:59:59.999Z');
    }
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checklist logs:', error);
      return [];
    }
    
    let result = (data || []) as any[];
    if (section && section !== 'all') {
       result = result.filter(log => log.checklist_templates?.section === section);
    }

    return result;
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
