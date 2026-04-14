import { Injectable, signal, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase-client';
import { Customer } from '../models/db.models';

export interface PublicCustomerState {
  id?: string;
  name: string;
  phone: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
}

@Injectable({
  providedIn: 'root'
})
export class PublicCustomerService {
  private readonly STORAGE_KEY = 'chefos_public_customer';
  
  customerState = signal<PublicCustomerState>({
    name: '',
    phone: '',
    street: '',
    number: '',
    neighborhood: '',
    complement: ''
  });

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored && stored !== 'undefined' && stored !== 'null') {
      try {
        this.customerState.set(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing stored customer data', e);
        localStorage.removeItem(this.STORAGE_KEY); // Clear invalid data
      }
    }
  }

  private saveToStorage(state: PublicCustomerState) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }

  updateState(newState: Partial<PublicCustomerState>) {
    this.customerState.update(current => {
      const updated = { ...current, ...newState };
      this.saveToStorage(updated);
      return updated;
    });
  }

  async saveCustomerToDatabase(restaurantUserId: string): Promise<Customer> {
    const state = this.customerState();
    
    if (!state.name || !state.phone) {
      throw new Error('Nome e telefone são obrigatórios');
    }

    const fullAddress = `${state.street}, ${state.number} - ${state.neighborhood}${state.complement ? ' (' + state.complement + ')' : ''}`;

    // Try to find existing customer by phone for this restaurant
    const { data: existingCustomer, error: searchError } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', restaurantUserId)
      .eq('phone', state.phone)
      .single();

    if (searchError && searchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error searching customer:', searchError);
      throw searchError;
    }

    const customerData = {
      user_id: restaurantUserId,
      name: state.name,
      phone: state.phone,
      address: fullAddress,
    };

    if (existingCustomer) {
      // Update existing
      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', existingCustomer.id)
        .select()
        .single();
        
      if (error) throw error;
      
      this.updateState({ id: data.id });
      return data as Customer;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();
        
      if (error) throw error;
      
      this.updateState({ id: data.id });
      return data as Customer;
    }
  }
}
