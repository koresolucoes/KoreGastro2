import { Injectable } from '@angular/core';
import { supabase } from './supabase-client';

export function getApiBaseUrl(): string {
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('.run.app') || origin.includes('webcontainer')) {
    if (origin.includes('localhost') && !origin.includes(':3000')) {
      return 'http://localhost:3000';
    }
    return origin;
  }
  return 'https://app.chefos.online';
}

@Injectable({
  providedIn: 'root'
})
export class ApiClientService {
  private baseUrl = getApiBaseUrl();

  async get<T>(path: string, params?: Record<string, string>): Promise<{ data?: T; error?: any }> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body?: any): Promise<{ data?: T; error?: any }> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: any): Promise<{ data?: T; error?: any }> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: any): Promise<{ data?: T; error?: any }> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<{ data?: T; error?: any }> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: any, params?: Record<string, string>): Promise<{ data?: T; error?: any }> {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let url = `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
      
      if (params && Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams(params).toString();
        url += `?${queryParams}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      const isJson = response.headers.get('content-type')?.includes('application/json');
      let responseData: any = null;
      if (isJson) {
        responseData = await response.json();
      }

      if (!response.ok) {
        return { error: responseData?.error || responseData || new Error(`Request failed with status ${response.status}`) };
      }

      return { data: responseData as T };
    } catch (error) {
      console.error(`[ApiClient] ${method} ${path} failed:`, error);
      return { error };
    }
  }
}
