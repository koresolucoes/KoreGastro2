import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { CoreDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';
import { StoreId } from '../../types';

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
      supabase.from('employees').select('id, name, role, email, phone, status, store_id, user_id, color, created_at, updated_at, hire_date, birth_date, cpf, base_salary, hourly_rate, employee_type').eq('user_id', storeId),
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
