import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
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
import { DemoService } from './services/demo.service';
import { supabase } from './services/supabase-client';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet, RouterLink, SidebarComponent, NotificationModalComponent, BottomNavComponent, ToastContainerComponent]
})
export class AppComponent implements OnInit {
  // Inject services here to ensure they are initialized at the root level.
  authService = inject(AuthService);
  operationalAuthService = inject(OperationalAuthService);
  supabaseStateService = inject(SupabaseStateService);
  subscriptionStateService = inject(SubscriptionStateService);
  demoService = inject(DemoService);
  router: Router = inject(Router);

  isDemoMode = this.demoService.isDemoMode;
  // FIX: Access properties from the injected `subscriptionStateService` instance.
  hasActiveSubscription = this.subscriptionStateService.hasActiveSubscription;
  isDataLoaded = this.supabaseStateService.isDataLoaded;
  // FIX: Access properties from the injected `subscriptionStateService` instance.
  isTrialing = this.subscriptionStateService.isTrialing;
  // FIX: Access properties from the injected `subscriptionStateService` instance.
  subscription = this.subscriptionStateService.subscription;
  // FIX: Access properties from the injected `subscriptionStateService` instance.
  trialDaysRemaining = this.subscriptionStateService.trialDaysRemaining;

  isTutorialsRoute = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.startsWith('/tutorials'))
    ),
    { initialValue: this.router.url.startsWith('/tutorials') }
  );

  isAuthLoading = computed(() => {
    // In demo mode, loading is instantly finished as it's synchronous.
    if (this.isDemoMode()) {
      return false;
    }
    // Otherwise, wait for both auth services to initialize.
    return !this.authService.authInitialized() || !this.operationalAuthService.operatorAuthInitialized();
  });

  isSubscriptionActiveOrTutorials = computed(() => {
    return this.hasActiveSubscription() || this.isTutorialsRoute();
  });

  isFullLayoutVisible = computed(() => {
    return (this.authService.currentUser() || this.isDemoMode()) && this.operationalAuthService.activeEmployee();
  });

  ngOnInit(): void {
    this.handleTokenAuthenticationFromUrl();
  }

  private handleTokenAuthenticationFromUrl(): void {
    // This logic only runs if not in demo mode.
    if (this.isDemoMode()) return;
    
    // Pega o fragmento da URL (tudo depois do '#')
    const hash = window.location.hash.substring(1);
    if (!hash || !hash.includes('access_token')) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type'); // Supabase adds type=recovery for password resets

    // Only proceed if it's a login flow (not a password recovery)
    if (accessToken && refreshToken && type !== 'recovery') {
      console.log('Tokens encontrados na URL. Tentando configurar a sessão...');
      
      (supabase.auth as any).setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ data, error }: { data: any, error: any }) => {
        if (error) {
          console.error('Erro ao configurar a sessão com tokens:', error);
          // Clean the URL and let the user stay on the login screen if it fails
          window.location.hash = '';
          this.router.navigate(['/login']); 
        } else if (data.session) {
          console.log('Sessão configurada com sucesso!');
          // Clean the URL and navigate to the main app page
          window.location.hash = '';
          // The auth guards will handle redirection from here, starting with employee selection
          this.router.navigate(['/employee-selection']);
        }
      });
    }
  }
}
