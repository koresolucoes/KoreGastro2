import { Injectable, signal, inject } from '@angular/core';
import { ToastService } from './toast.service';

export interface NotificationState {
  isOpen: boolean;
  message: string;
  title: string;
  type: 'alert' | 'confirm' | 'prompt';
  confirmText: string;
  cancelText: string;
  inputType?: 'text' | 'textarea';
  placeholder?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private toastService = inject(ToastService);

  notificationState = signal<NotificationState>({
    isOpen: false,
    message: '',
    title: '',
    type: 'alert',
    confirmText: 'OK',
    cancelText: 'Cancelar',
  });

  promptInputValue = signal('');

  private resolvePromise!: (value: any) => void;

  /**
   * Shows a short, non-blocking notification message.
   * @param message The message to display.
   * @param type The type of toast ('success', 'error', 'info', 'warning').
   * @param duration The duration in milliseconds.
   */
  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 4000) {
    this.toastService.show(message, type, duration);
  }

  /**
   * Shows a modal dialog that requires user interaction. Use for critical information.
   * For simple success/error messages, prefer `show()`.
   * @param message The message to display.
   * @param title The title of the modal.
   * @deprecated Use `show()` for non-blocking feedback or `confirm()` for user decisions. This is for critical, blocking alerts.
   */
  alert(message: string, title: string = 'Aviso'): Promise<void> {
    // Check if the message indicates a common backend error and replace it with a more user-friendly message.
    const userFriendlyMessage = this.translateErrorMessage(message);
    
    this.notificationState.set({
      isOpen: true,
      message: userFriendlyMessage,
      title,
      type: 'alert',
      confirmText: 'OK',
      cancelText: '',
    });
    return new Promise(resolve => {
      this.resolvePromise = () => resolve();
    });
  }

  confirm(message: string, title: string = 'Confirmação'): Promise<boolean> {
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'confirm',
      confirmText: 'OK',
      cancelText: 'Cancelar',
    });
    return new Promise(resolve => {
      this.resolvePromise = resolve;
    });
  }
  
  prompt(
    message: string, 
    title: string, 
    options: { 
      inputType?: 'text' | 'textarea', 
      placeholder?: string, 
      initialValue?: string, 
      confirmText?: string 
    } = {}
  ): Promise<{ confirmed: boolean, value: string | null }> {
    this.promptInputValue.set(options.initialValue || '');
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'prompt',
      confirmText: options.confirmText || 'Salvar',
      cancelText: 'Cancelar',
      inputType: options.inputType || 'textarea',
      placeholder: options.placeholder || '',
    });
    return new Promise(resolve => {
      this.resolvePromise = (confirmed: boolean) => {
        resolve({ confirmed, value: confirmed ? this.promptInputValue() : null });
      };
    });
  }

  private translateErrorMessage(message: string): string {
      if (message.includes('User not authenticated')) {
          return 'Sua sessão expirou ou você não tem permissão para realizar esta ação. Por favor, tente fazer login novamente.';
      }
      if (message.includes('invalid input syntax for type uuid')) {
          return 'Ocorreu um erro ao processar a solicitação. O identificador fornecido é inválido. Por favor, recarregue a página e tente novamente.';
      }
      // Add more translations for other common errors here
      return message;
  }

  private close(): void {
    this.notificationState.update(state => ({ ...state, isOpen: false }));
  }

  onConfirm(): void {
    this.close();
    if (this.resolvePromise) {
      if (this.notificationState().type === 'alert') {
        (this.resolvePromise as () => void)();
      } else {
        this.resolvePromise(true);
      }
    }
  }

  onCancel(): void {
    this.close();
    if (this.resolvePromise) {
      if (this.notificationState().type !== 'alert') {
        this.resolvePromise(false);
      }
    }
  }
}
