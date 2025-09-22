import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, RouterLink } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AuthService } from './services/auth.service';
import { SupabaseStateService } from './services/supabase-state.service';
import { OperationalAuthService } from './services/operational-auth.service';
import { NotificationModalComponent } from './components/notification-modal/notification-modal.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { ToastContainerComponent } from './components/shared/toast-container/toast-container.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { SubscriptionStateService } from './services/subscription-state.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet, RouterLink, SidebarComponent, NotificationModalComponent, BottomNavComponent, ToastContainerComponent]
})
export class AppComponent {
  // Inject services here to ensure they are initialized at the root level.
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  supabaseStateService = inject(SupabaseStateService);
  subscriptionStateService = inject(SubscriptionStateService);
  router = inject(Router);

  hasActiveSubscription = this.subscriptionStateService.hasActiveSubscription;
  isDataLoaded = this.supabaseStateService.isDataLoaded;
  isTrialing = this.subscriptionStateService.isTrialing;
  subscription = this.subscriptionStateService.subscription;
  trialDaysRemaining = this.subscriptionStateService.trialDaysRemaining;

  isTutorialsRoute = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.startsWith('/tutorials'))
    ),
    { initialValue: this.router.url.startsWith('/tutorials') }
  );

  isSubscriptionActiveOrTutorials = computed(() => {
    return this.hasActiveSubscription() || this.isTutorialsRoute();
  });

  isFullLayoutVisible = computed(() => {
    return this.authService.currentUser() && this.operationalAuthService.activeEmployee();
  });
}
