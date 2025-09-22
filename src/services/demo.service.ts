import { Injectable, signal } from '@angular/core';

const DEMO_MODE_KEY = 'chefos_demo_mode';

@Injectable({
  providedIn: 'root',
})
export class DemoService {
  isDemoMode = signal(false);

  constructor() {
    // This check is synchronous and runs on service initialization.
    this.checkDemoMode();
  }

  private checkDemoMode(): void {
    const isDemo = sessionStorage.getItem(DEMO_MODE_KEY) === 'true';
    this.isDemoMode.set(isDemo);
  }

  enableDemoMode(): void {
    sessionStorage.setItem(DEMO_MODE_KEY, 'true');
    this.isDemoMode.set(true);
  }

  disableDemoMode(): void {
    sessionStorage.removeItem(DEMO_MODE_KEY);
    this.isDemoMode.set(false);
  }
  
  toggleDemoMode(): void {
      if (this.isDemoMode()) {
          this.disableDemoMode();
      } else {
          this.enableDemoMode();
      }
  }
}
