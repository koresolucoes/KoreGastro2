import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SystemAdminService } from '../services/system-admin.service';

export const systemAdminGuard: CanActivateFn = async () => {
  const admins = inject(SystemAdminService);
  const router = inject(Router);
  return await admins.checkAdminStatus('') || router.createUrlTree(['/dashboard']);
};
