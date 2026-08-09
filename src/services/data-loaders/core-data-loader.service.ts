import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { CoreDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';

@Injectable({
  providedIn: 'root'
})
export class CoreDataLoaderService {
  public async load(userId: string): Promise<CoreDataLoadResult> {
    const [
      companyProfileRes, 
      rolesRes, 
      rolePermissionsRes, 
      employeesRes, 
      webhooksRes
    ] = await Promise.all([
      supabase.from('company_profile').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('roles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('role_permissions').select('*').eq('user_id', userId),
      supabase.from('employees').select('*').eq('user_id', userId),
      supabase.from('webhooks').select('*').eq('user_id', userId),
    ]);

    const companyProfile = assertCriticalDataResult(companyProfileRes, 'company_profile');
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
