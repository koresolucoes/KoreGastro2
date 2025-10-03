import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './../services/auth.service';
import { DemoService } from './../services/demo.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { OperationalAuthService } from './../services/operational-auth.service';

export const loginGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const demoService = inject(DemoService);
  const operationalAuthService = inject(OperationalAuthService);
  const router = inject(Router);

  // If the user is already in demo mode, they are "logged in".
  // Redirect to the dashboard to prevent showing the login screen.
  if (demoService.isDemoMode()) {
    return of(router.createUrlTree(['/dashboard']));
  }

  // Wait for authentication to be initialized to avoid race conditions.
  return toObservable(authService.authInitialized).pipe(
    filter(initialized => initialized),
    take(1),
    map(() => {
      // If there is a system user logged in...
      if (authService.currentUser()) {
        // ...redirect to their default route (usually dashboard or employee selection).
        const defaultRoute = operationalAuthService.getDefaultRoute();
        return router.createUrlTree([defaultRoute]);
      } else {
        // If no one is logged in, allow access to the login page.
        return true;
      }
    })
  );
};
