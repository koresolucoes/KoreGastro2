import { Injectable, signal } from '@angular/core';

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
  notificationState = signal<NotificationState>({
    isOpen: false,
    message: '',
    title: '',
    type: 'alert',
    confirmText: 'OK',
    cancelText: 'Cancelar',
  });

  // FIX: Updated type to correctly handle promise resolvers for boolean Promises.
  // The original type `(value: boolean | void) => void` was not compatible with the
  // `(value: boolean | PromiseLike<boolean>) => void` signature of a Promise<boolean> resolver.
  private resolveConfirmation!: (value: boolean | PromiseLike<boolean>) => void;

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