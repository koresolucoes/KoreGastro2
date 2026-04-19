import { Component, ChangeDetectionStrategy, input, output, computed, InputSignal, OutputEmitterRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="flex items-center w-full max-w-sm p-4 gap-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-strong bg-surface-elevated/90 backdrop-blur-lg animate-in slide-in-from-bottom-4 fade-in duration-300 relative overflow-hidden"
      role="alert">
      <!-- Glow effect based on type -->
      <div class="absolute inset-y-0 left-0 w-1 shadow-inner opacity-75" [class]="glowClass()"></div>
      <div [innerHTML]="iconSvg()" class="shrink-0 flex items-center justify-center relative z-10"></div>
      <div class="text-sm font-bold tracking-tight text-title flex-1 relative z-10">{{ message() }}</div>
       <button type="button" (click)="close.emit()" class="ms-auto rounded-xl focus:ring-2 focus:ring-brand/50 p-2 inline-flex items-center justify-center h-8 w-8 text-muted hover:text-title hover-surface-elevated transition-colors bg-surface/50 backdrop-blur-sm relative z-10" aria-label="Close">
        <span class="sr-only">Close</span>
        <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/></svg>
    </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  message: InputSignal<string> = input.required<string>();
  type: InputSignal<'success' | 'error' | 'info' | 'warning'> = input<'success' | 'error' | 'info' | 'warning'>('info');
  close: OutputEmitterRef<void> = output<void>();

  iconSvg = computed(() => {
    switch (this.type()) {
      case 'success':
        return `<svg class="w-6 h-6 text-success drop-shadow-[0_0_8px_rgba(22,163,74,0.4)]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 8.207-4 4a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L9 10.586l3.293-3.293a1 1 0 0 1 1.414 1.414Z"/></svg>`;
      case 'error':
        return `<svg class="w-6 h-6 text-danger drop-shadow-[0_0_8px_rgba(220,38,38,0.4)]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z"/></svg>`;
      case 'warning':
        return `<svg class="w-6 h-6 text-warning drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM10 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v5Z"/></svg>`;
      case 'info':
        return `<svg class="w-6 h-6 text-brand drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/></svg>`;
      default:
        return '';
    }
  });

  glowClass = computed(() => {
    switch (this.type()) {
      case 'success': return 'bg-success';
      case 'error': return 'bg-danger';
      case 'warning': return 'bg-warning';
      case 'info': return 'bg-brand';
      default: return 'bg-transparent';
    }
  });
}
