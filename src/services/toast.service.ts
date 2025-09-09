import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  toasts = signal<Toast[]>([]);
  private lastId = 0;

  show(message: string, type: Toast['type'] = 'info', duration = 4000) {
    const id = ++this.lastId;
    const newToast: Toast = { id, message, type, duration };
    
    this.toasts.update(currentToasts => [...currentToasts, newToast]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  remove(id: number) {
    this.toasts.update(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }
}
