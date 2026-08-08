import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { PortalContextService } from '../services/portal-context.service';

export const portalGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): boolean | UrlTree => {
  const portalService = inject(PortalContextService);
  const router = inject(Router);

  const routePath = state.url.split('?')[0];

  if (portalService.isRouteAllowedInCurrentPortal(routePath)) {
    return true;
  }

  // If route is not allowed in current portal mode, redirect to default path for current portal
  const currentMode = portalService.currentMode();
  const defaultRoute = portalService.getPortalDefaultRoute(currentMode === 'operacao' ? 'operacao' : 'gestao');

  console.warn(`[PortalGuard] Rota '${routePath}' não pertence ao portal atual (${currentMode}). Redirecionando para ${defaultRoute}.`);

  return router.createUrlTree([defaultRoute]);
};
