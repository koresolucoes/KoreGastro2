import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DemoService } from '../services/demo.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { OperationalAuthService } from '../services/operational-auth.service';
import { SupabaseStateService } from '../services/supabase-state.service';

export const loginGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const demoService = inject(DemoService);
  const operationalAuthService = inject(OperationalAuthService);
  const router = inject(Router);
  const supabaseStateService = inject(SupabaseStateService);

  // If the user is already in demo mode, they are "logged in".
  // Redirect to the dashboard to prevent showing the login screen.
  if (demoService.isDemoMode()) {
    return of(router.createUrlTree(['/dashboard']));
  }

  // Wait for authentication to be initialized to avoid race conditions.
  return toObservable(authService.authInitialized).pipe(
    filter(initialized => initialized),
    take(1),
    switchMap(() => {
      // If there is no system user logged in, allow access to the login page.
      if (!authService.currentUser()) {
        return of(true);
      }
      
      // If a user is logged in, we must wait for all data to be loaded
      // to determine their correct default route, which depends on permissions.
      return toObservable(supabaseStateService.isDataLoaded).pipe(
        filter(loaded => loaded),
        take(1),
        map(() => {
          const defaultRoute = operationalAuthService.getDefaultRoute();
          return router.createUrlTree([defaultRoute]);
        })
      );
    })
  );
};
