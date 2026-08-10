import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { CoreDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';
import { StoreId } from '../../types';

// Keep this projection aligned with the real `employees` table. In addition to
// avoiding accidental exposure of PIN hashes, an explicit projection makes a
// schema drift fail in review/tests instead of breaking the whole bootstrap at
// runtime. See migration 20260808000000_system_tables.sql.
export const EMPLOYEE_BOOTSTRAP_COLUMNS = 'id, name, role, role_id, phone, user_id, current_clock_in_id, salary_type, salary_rate, overtime_rate_multiplier, birth_date, cpf, rg, address, emergency_contact_name, emergency_contact_phone, hire_date, termination_date, bank_details, photo_url, pix_key, created_at, updated_at' as const;

@Injectable({
  providedIn: 'root'
})
export class CoreDataLoaderService {
  public async load(storeId: StoreId): Promise<CoreDataLoadResult> {
    const [
      companyProfileRes, 
      rolesRes, 
      rolePermissionsRes, 
      employeesRes, 
      webhooksRes
    ] = await Promise.all([
      supabase.from('company_profile_public').select('*').eq('user_id', storeId).maybeSingle(),
      supabase.from('roles').select('*').eq('user_id', storeId).order('created_at', { ascending: true }),
      supabase.from('role_permissions').select('*').eq('user_id', storeId),
      supabase
        .from('employees')
        .select(EMPLOYEE_BOOTSTRAP_COLUMNS)
        .eq('user_id', storeId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      supabase.from('webhooks').select('*').eq('user_id', storeId),
    ]);

    const companyProfile = assertCriticalDataResult(companyProfileRes, 'company_profile_public');
    const roles = assertCriticalDataResult(rolesRes, 'roles') || [];
    const rolePermissions = assertCriticalDataResult(rolePermissionsRes, 'role_permissions') || [];
    const employees = assertCriticalDataResult(employeesRes, 'employees') || [];
    const webhooks = extractOptionalDataResult(webhooksRes, 'webhooks', []);

    return {
      companyProfile,
      roles,
      rolePermissions,
      employees,
      webhooks
    };
  }
}
