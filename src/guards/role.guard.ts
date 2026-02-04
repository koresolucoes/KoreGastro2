
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from './../services/auth.service';
import { OperationalAuthService } from './../services/operational-auth.service';
import { Observable, map, of, combineLatest } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { DemoService } from './../services/demo.service';
import { filter, take, timeout, catchError } from 'rxjs/operators';
import { SupabaseStateService } from '../services/supabase-state.service';
import { SubscriptionStateService } from '../services/subscription-state.service';

export const roleGuard: CanActivateFn = (
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree => {
  const authService = inject(AuthService);
  const operationalAuthService = inject(OperationalAuthService);
  const router: Router = inject(Router);
  const demoService = inject(DemoService);
  const supabaseStateService = inject(SupabaseStateService);
  const subscriptionStateService = inject(SubscriptionStateService);

  if (demoService.isDemoMode()) {
    if (operationalAuthService.activeEmployee()) {
        return true;
    }
    
    // Wait for the demo employee to be auto-logged in to prevent race conditions.
    return toObservable(operationalAuthService.activeEmployee).pipe(
      filter(emp => emp !== null), // Wait for a non-null value
      take(1),                     // Only need the first emission
      map(() => true),             // Then allow access
      timeout(3000),               // Wait for a maximum of 3 seconds
      catchError(() => {
        // If it times out, something is wrong with the demo login logic.
        // Redirect to start the demo process again as a fallback.
        console.error('RoleGuard: Timed out waiting for demo user login.');
        return of(router.createUrlTree(['/demo']));
      })
    );
  }

  // Wait for:
  // 1. Auth check (AuthService)
  // 2. Operator selection (OperationalAuthService)
  // 3. Main Data Load (SupabaseStateService)
  // 4. Subscription & Permissions Load (SubscriptionStateService) -> CRITICAL FIX
  return combineLatest([
    toObservable(authService.authInitialized).pipe(filter(init => init), take(1)),
    toObservable(operationalAuthService.operatorAuthInitialized).pipe(filter(init => init), take(1)),
    toObservable(supabaseStateService.isDataLoaded).pipe(filter(loaded => loaded), take(1)),
    toObservable(subscriptionStateService.isLoading).pipe(filter(loading => !loading), take(1))
  ]).pipe(
    map(() => {
      const user = authService.currentUser();
      if (!user) {
        // Not logged into the system, redirect to main login
        return router.createUrlTree(['/login']);
      }

      const activeEmployee = operationalAuthService.activeEmployee();
      if (!activeEmployee) {
        // Logged into system, but no operator selected
        return router.createUrlTree(['/employee-selection']);
      }

      // Check if subscription is active first
      if (!subscriptionStateService.hasActiveSubscription()) {
          // If accessing tutorials or profile, allow it even without subscription
          if (state.url.startsWith('/tutorials') || state.url.startsWith('/my-profile')) {
              return true;
          }
          // Otherwise, allow navigation but the Component will show the "Inactive Plan" screen
          return true; 
      }

      if (operationalAuthService.hasPermission(state.url)) {
        // Operator is selected and has permission
        return true;
      }

      // Operator is selected but doesn't have permission, redirect to their default page
      const defaultRoute = operationalAuthService.getDefaultRoute();
      
      // Prevent infinite redirect loop if default route is also blocked
      if (state.url === defaultRoute) {
          return router.createUrlTree(['/employee-selection']);
      }
      
      return router.createUrlTree([defaultRoute]);
    })
  );
};
