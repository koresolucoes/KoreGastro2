import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { CoreDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult, extractOptionalDataResult } from './data-loader.utils';

@Injectable({
  providedIn: 'root'
})
export class CoreDataLoaderService {
  public async load(userId: string): Promise<CoreDataLoadResult> {
    let [
      companyProfileRes, 
      rolesRes, 
      rolePermissionsRes, 
      employeesRes, 
      webhooksRes
    ] = await Promise.all([
      supabase.from('company_profile_public').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('roles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('role_permissions').select('*').eq('user_id', userId),
      supabase.from('employees').select('*').eq('user_id', userId),
      supabase.from('webhooks').select('*').eq('user_id', userId),
    ]);

    if (companyProfileRes.error) {
      console.warn('[CoreDataLoaderService] company_profile_public query failed, falling back to company_profile:', companyProfileRes.error);
      companyProfileRes = await supabase.from('company_profile').select('*').eq('user_id', userId).maybeSingle();
    }

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
