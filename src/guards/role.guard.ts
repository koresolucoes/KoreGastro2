
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OperationalAuthService } from '../services/operational-auth.service';
import { Observable, map } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

export const roleGuard: CanActivateFn = (
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree => {
  const authService = inject(AuthService);
  const operationalAuthService = inject(OperationalAuthService);
  const router = inject(Router);

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