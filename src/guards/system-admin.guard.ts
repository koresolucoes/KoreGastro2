import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SystemAdminService } from '../services/system-admin.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, take } from 'rxjs/operators';
import { of } from 'rxjs';

export const systemAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const adminService = inject(SystemAdminService);
  const router = inject(Router);

  return toObservable(authService.authInitialized).pipe(
    filter(init => init),
    take(1),
    switchMap(() => {
      const user = authService.currentUser();
      if (!user || !user.email) {
        return of(router.createUrlTree(['/login']));
      }
      return adminService.checkAdminStatus(user.email).then(isAdmin => {
        if (isAdmin) return true;
        return router.createUrlTree(['/dashboard']);
      });
    })
  );
};
