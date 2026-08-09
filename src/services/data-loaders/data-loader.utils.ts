import { PostgrestSingleResponse } from '@supabase/supabase-js';

export function assertCriticalDataResult<T>(res: PostgrestSingleResponse<T>, entityName: string): T {
  if (res.error) {
    console.error(`[DataLoader] Error loading ${entityName}:`, res.error);
    throw new Error(`Failed to load essential data: ${entityName}. Check connection and permissions.`);
  }
  return res.data as T;
}

export function extractOptionalDataResult<T>(res: PostgrestSingleResponse<T>, entityName: string, fallback: T): T {
  if (res.error) {
    console.warn(`[DataLoader] Optional data error loading ${entityName}:`, res.error);
    return fallback;
  }
  return res.data as T;
}
