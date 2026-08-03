import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  public isMobileSidebarOpen = signal<boolean>(false);

  toggleMobileSidebar() {
    this.isMobileSidebarOpen.update(v => !v);
  }
  
  closeMobileSidebar() {
    this.isMobileSidebarOpen.set(false);
  }
}
