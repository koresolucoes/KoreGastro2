import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OperationalAuthService } from '../services/operational-auth.service';
import { Observable, map, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { DemoService } from '../services/demo.service';

export const roleGuard: CanActivateFn = (
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree => {
  const authService = inject(AuthService);
  const operationalAuthService = inject(OperationalAuthService);
  const router = inject(Router);
  const demoService = inject(DemoService);

  // In demo mode, we only care about the operational user (activeEmployee), not the system user (currentUser).
  if (demoService.isDemoMode()) {
    if (operationalAuthService.activeEmployee()) {
        // A demo operator is logged in, allow access.
        // We don't need to check permissions here because the demo user is a manager with all permissions.
        return true;
    } else {
        // This case might happen if the user navigates directly to a protected route in demo mode
        // without going through the /demo entry point. Redirecting them to /demo is safest.
        return router.createUrlTree(['/demo']);
    }
  }

  // Original logic for non-demo users
  return toObservable(authService.currentUser).pipe(
    map(user => {
        if (!user) {
            // Not logged into the system, redirect to main login
            return router.createUrlTree(['/login']);
        }

        const activeEmployee = operationalAuthService.activeEmployee();
        if (!activeEmployee) {
            // Logged into system, but no operator selected
            return router.createUrlTree(['/employee-selection']);
        }

        if (operationalAuthService.hasPermission(state.url)) {
            // Operator is selected and has permission
            return true;
        }

        // Operator is selected but doesn't have permission, redirect to their default page
        const defaultRoute = operationalAuthService.getDefaultRoute();
        return router.createUrlTree([defaultRoute]);
    })
  );
};
