import { Injectable, signal } from '@angular/core';

const DEMO_MODE_KEY = 'chefos_demo_mode';

@Injectable({
  providedIn: 'root',
})
export class DemoService {
  isDemoMode = signal(false);

  constructor() {
    const isDemo = import.meta.env.DEV && sessionStorage.getItem(DEMO_MODE_KEY) === 'true';
    this.isDemoMode.set(isDemo);
  }

  enableDemoMode(): void {
    if (!import.meta.env.DEV) return;
    sessionStorage.setItem(DEMO_MODE_KEY, 'true');
    this.isDemoMode.set(true);
  }

  disableDemoMode(): void {
    sessionStorage.removeItem(DEMO_MODE_KEY);
    this.isDemoMode.set(false);
  }
}