import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AuthService } from './services/auth.service';
import { SupabaseStateService } from './services/supabase-state.service';
import { OperationalAuthService } from './services/operational-auth.service';
import { NotificationModalComponent } from './components/notification-modal/notification-modal.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { ToastContainerComponent } from './components/shared/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NotificationModalComponent, BottomNavComponent, ToastContainerComponent]
})
export class AppComponent {
  // Inject services here to ensure they are initialized at the root level.
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  supabaseStateService = inject(SupabaseStateService);

  hasActiveSubscription = this.supabaseStateService.hasActiveSubscription;
  isDataLoaded = this.supabaseStateService.isDataLoaded;

  isFullLayoutVisible = computed(() => {
    return this.authService.currentUser() && this.operationalAuthService.activeEmployee();
  });
}
