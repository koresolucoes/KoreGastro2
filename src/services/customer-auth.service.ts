import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase-client';

export interface MenuCustomer {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  loyalty_points: number;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerAuthService {
  customer = signal<MenuCustomer | null>(null);

  constructor() {
    this.checkSession();
  }

  private checkSession() {
    const session = localStorage.getItem('menu_customer_session');
    if (session) {
      try {
        this.customer.set(JSON.parse(session));
      } catch (e) {
        localStorage.removeItem('menu_customer_session');
      }
    }
  }

  private setSession(customer: MenuCustomer) {
    this.customer.set(customer);
    localStorage.setItem('menu_customer_session', JSON.stringify(customer));
  }

  logout() {
    this.customer.set(null);
    localStorage.removeItem('menu_customer_session');
  }

  async authenticate(storeId: string, cpf: string, password: string): Promise<{ success: boolean; message?: string }> {
    cpf = cpf.replace(/\D/g, ''); // Ensure only numbers
    const { data, error } = await supabase.rpc('authenticate_menu_customer', {
      p_store_id: storeId,
      p_cpf: cpf,
      p_password: password
    });

    if (error) {
      console.error(error);
      return { success: false, message: 'Erro de conexão com o servidor.' };
    }

    if (data?.success && data.customer) {
      this.setSession(data.customer);
      return { success: true };
    }

    return { success: false, message: data?.message || 'Login falhou.' };
  }

  async register(storeId: string, name: string, phone: string, cpf: string, password: string): Promise<{ success: boolean; message?: string }> {
    cpf = cpf.replace(/\D/g, '');
    phone = phone.replace(/\D/g, '');
    
    const { data, error } = await supabase.rpc('register_menu_customer', {
      p_store_id: storeId,
      p_name: name,
      p_phone: phone,
      p_cpf: cpf,
      p_password: password
    });

    if (error) {
      console.error(error);
      return { success: false, message: 'Erro de conexão com o servidor.' };
    }

    if (data?.success && data.customer) {
      this.setSession(data.customer);
      return { success: true };
    }

    return { success: false, message: data?.message || 'Cadastro falhou.' };
  }
  
  async getOrderHistory(storeId: string): Promise<any[]> {
    if (!this.customer()) return [];
    
    const { data, error } = await supabase.rpc('get_menu_customer_history', {
      p_store_id: storeId,
      p_customer_id: this.customer()!.id
    });
    
    if (error || !data?.success) {
      return [];
    }
    
    return data.orders || [];
  }
  
  async refreshCustomerData(storeId: string) {
    if (!this.customer()) return;
    
    const { data, error } = await supabase.rpc('get_menu_customer_profile', {
      p_store_id: storeId,
      p_customer_id: this.customer()!.id
    });
    
    if (!error && data?.success && data.customer) {
      this.setSession(data.customer);
    }
  }
}
