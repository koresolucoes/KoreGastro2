import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SettingsStateService } from './settings-state.service';
import { NotificationService } from './notification.service';
import { DemoService } from './demo.service';

@Injectable({
  providedIn: 'root',
})
export class FocusNFeService {
  private authService = inject(AuthService);
  private settingsState = inject(SettingsStateService);
  private notificationService = inject(NotificationService);
  private demoService = inject(DemoService);

  private async proxyRequest<T>(action: string, payload: any): Promise<{ success: boolean; error?: any; data?: T }> {
    if (this.demoService.isDemoMode()) {
        this.notificationService.show('Funcionalidade fiscal não disponível no modo de demonstração.', 'info');
        return { success: false, error: { message: 'Modo de demonstração' } };
    }

    const restaurantId = this.authService.currentUser()?.id;
    const apiKey = this.settingsState.companyProfile()?.external_api_key;

    if (!restaurantId || !apiKey) {
      const error = { message: 'Usuário ou chave de API não configurados.' };
      this.notificationService.show(error.message, 'error');
      return { success: false, error };
    }

    try {
      const response = await fetch('https://gastro.koresolucoes.com.br/api/focusnfe-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ restaurantId, action, payload }),
      });

      const responseBody = await response.json();

      if (!response.ok) {
        throw new Error(responseBody.error?.message || `Proxy error (${response.status})`);
      }

      return { success: true, data: responseBody.data };
    } catch (error) {
      console.error(`[FocusNFeService] Erro na ação '${action}':`, error);
      return { success: false, error };
    }
  }

  async saveTokenAndCertificate(
    token: string,
    certificateFile: File | null,
    certificatePass: string
  ): Promise<{ success: boolean, error?: any }> {
    
    let certificateBase64: string | null = null;
    if (certificateFile) {
        certificateBase64 = await this.fileToBase64(certificateFile);
    }
    
    const payload = {
        token: token,
        certificateBase64: certificateBase64,
        certificatePassword: certificatePass
    };

    return this.proxyRequest('save_settings', payload);
  }
  
  async emitNfce(orderId: string): Promise<{ success: boolean, error?: any, data?: any }> {
    return this.proxyRequest('emit_nfce', { orderId });
  }

  async cancelNfce(orderId: string, justification: string): Promise<{ success: boolean, error?: any, data?: any }> {
    return this.proxyRequest('cancel_nfce', { orderId, justification });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]); // Get only base64 part
      reader.onerror = error => reject(error);
    });
  }
}