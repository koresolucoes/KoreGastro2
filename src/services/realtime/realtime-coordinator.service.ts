import { Injectable } from '@angular/core';
import { supabase } from '../supabase-client';
import { StoreId } from '../../types';

@Injectable({ providedIn: 'root' })
export class RealtimeCoordinatorService {
  private realtimeChannel: any | null = null;
  private retryTimeout: any;
  private currentStoreId: StoreId | null = null;
  private currentGeneration: number = 0;

  public start(
    storeId: StoreId, 
    generation: number,
    onValidEvent: (payload: any) => void
  ) {
    this.stop();
    this.currentStoreId = storeId;
    this.currentGeneration = generation;

    const connect = () => {
        this.realtimeChannel = supabase.channel(`db-changes:${storeId}`)
          .on(
            'postgres_changes', 
            { event: '*', schema: 'public' }, 
            (payload: any) => {
                // Ignore events if context has changed (stale events)
                if (this.currentGeneration !== generation || this.currentStoreId !== storeId) return;

                // Validate Tenancy
                const relevantRow = payload.new || payload.old;
                if (relevantRow) {
                    const tenantId = this.resolveRealtimeStoreId(payload.table, relevantRow);
                    if (tenantId && tenantId !== storeId) return;
                }
                
                // Route validated event to orchestrator
                onValidEvent(payload);
            }
          )
          .subscribe((status, err) => {
            if (this.currentGeneration !== generation || this.currentStoreId !== storeId) return;

            if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                if (this.retryTimeout) clearTimeout(this.retryTimeout);
                this.retryTimeout = setTimeout(() => {
                    if (this.currentGeneration === generation && this.currentStoreId === storeId) {
                        connect();
                    }
                }, 5000);
            }
          });
    };

    connect();
  }

  public stop() {
    this.currentStoreId = null;
    this.currentGeneration = 0;
    
    if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
    }
    if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = null;
    }
  }

  public resolveRealtimeStoreId(table: string, row: any): StoreId | null {
    if (!row) return null;

    if (table === 'recipes' || table === 'store_custom_prices') {
      return row.store_id || null;
    }

    if (row.user_id) {
      return row.user_id;
    }

    if (row.store_id) {
      return row.store_id;
    }

    return null;
  }
}
