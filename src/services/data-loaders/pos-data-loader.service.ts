import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { PosDataLoadResult } from '../../models/data-loader.models';
import { assertCriticalDataResult } from './data-loader.utils';
import { StoreId } from '../../types';

@Injectable({
  providedIn: 'root'
})
export class PosDataLoaderService {
  public async load(storeId: StoreId): Promise<PosDataLoadResult> {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const [
      hallsRes, 
      tablesRes, 
      stationsRes, 
      customersRes, 
      ordersRes
    ] = await Promise.all([
      supabase.from('halls').select('*').eq('user_id', storeId).order('created_at', { ascending: true }),
      supabase.from('tables').select('*').eq('user_id', storeId),
      supabase.from('stations').select('*, employees(*)').eq('user_id', storeId),
      supabase.from('customers').select('*').eq('user_id', storeId).order('created_at', { ascending: true }),
      // Only load OPEN orders or recently closed ones to keep memory low
      supabase.from('orders')
        .select('*, order_items(*), customers(*), delivery_drivers(*), waiter:employees!created_by_employee_id(name)')
        .eq('user_id', storeId)
        .or(`status.eq.OPEN,status.eq.PAYING,status.eq.AWAITING,and(status.eq.CANCELLED,completed_at.gte.${twelveHoursAgo})`)
    ]);

    const halls = assertCriticalDataResult(hallsRes, 'halls') || [];
    const tables = assertCriticalDataResult(tablesRes, 'tables') || [];
    const stations = assertCriticalDataResult(stationsRes, 'stations') || [];
    const customers = assertCriticalDataResult(customersRes, 'customers') || [];
    const orders = assertCriticalDataResult(ordersRes, 'orders') || [];

    return {
      halls,
      tables,
      stations,
      customers,
      orders
    };
  }
}
