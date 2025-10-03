import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './../services/auth.service';
import { map, filter, take } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { DemoService } from './../services/demo.service';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const demoService = inject(DemoService);

  // If in demo mode, bypass all authentication checks.
  if (demoService.isDemoMode()) {
    return of(true);
  }

  // This guard now waits until the authentication service has finished its initial check.
  // This prevents the race condition where the guard runs before the user session is loaded.
  return toObservable(authService.authInitialized).pipe(
    filter(initialized => initialized), // Wait until the signal is true
    take(1), // We only need to check once initialization is complete
    map(() => {
      // Now that we know the auth state is definitive, we can check the user.
      if (authService.currentUser()) {
        return true; // User is logged in, allow access.
      } else {
        // User is not logged in, redirect to the login page.
        return router.createUrlTree(['/login']);
      }
    })
  );
};
