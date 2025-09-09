import { Injectable, signal, inject } from '@angular/core';
import { ToastService } from './toast.service';

export interface NotificationState {
  isOpen: boolean;
  message: string;
  title: string;
  type: 'alert' | 'confirm';
  confirmText: string;
  cancelText: string;
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

  private resolveConfirmation!: (value: boolean | PromiseLike<boolean>) => void;

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
    this.notificationState.set({
      isOpen: true,
      message,
      title,
      type: 'alert',
      confirmText: 'OK',
      cancelText: '',
    });
    return new Promise(resolve => {
      this.resolveConfirmation = () => resolve();
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
      this.resolveConfirmation = resolve;
    });
  }

  private close(): void {
    this.notificationState.update(state => ({ ...state, isOpen: false }));
  }

  onConfirm(): void {
    this.close();
    if (this.resolveConfirmation) {
      this.resolveConfirmation(true);
    }
  }

  onCancel(): void {
    this.close();
    if (this.resolveConfirmation) {
      this.resolveConfirmation(false);
    }
  }
}
