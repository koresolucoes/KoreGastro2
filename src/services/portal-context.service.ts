import { Injectable, signal, computed } from '@angular/core';

export type PortalType = 'gestao' | 'operacao' | 'all';

export interface PortalInfo {
  type: PortalType;
  name: string;
  badge: string;
  description: string;
  domain: string;
  color: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class PortalContextService {
  private readonly GESTAO_DOMAIN = 'portal.chefos.online';
  private readonly OPERACAO_DOMAIN = 'app.chefos.online';
  private readonly STORAGE_KEY = 'chefos_simulated_portal_mode';

  // Signals
  readonly currentMode = signal<PortalType>(this.detectInitialPortalMode());
  readonly isDomainLocked = signal<boolean>(this.checkIfDomainIsLocked());

  readonly portalInfo = computed<PortalInfo>(() => {
    const mode = this.currentMode();
    if (mode === 'operacao') {
      return {
        type: 'operacao',
        name: 'Portal Operacional (PDV & Cozinha)',
        badge: 'App Operacional',
        description: 'Vendas, PDV, Mesas, KDS, Entregas e Operação em Tempo Real',
        domain: this.OPERACAO_DOMAIN,
        color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        icon: 'point_of_sale'
      };
    } else if (mode === 'gestao') {
      return {
        type: 'gestao',
        name: 'Portal de Gestão & RH',
        badge: 'Gestão & RH',
        description: 'Dashboard, DRE, DREs, Compras, Estoque, RH, Escalas e Relatórios',
        domain: this.GESTAO_DOMAIN,
        color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        icon: 'analytics'
      };
    } else {
      return {
        type: 'all',
        name: 'Portal Unificado (Modo Dev)',
        badge: 'Portal Completo',
        description: 'Exibindo todos os módulos administrativos e operacionais simultaneamente',
        domain: window.location.hostname,
        color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        icon: 'hub'
      };
    }
  });

  // Categorized Routes
  readonly GESTAO_PATHS = [
    '/dashboard',
    '/tutorials',
    '/reports',
    '/customers',
    '/suppliers',
    '/ifood-store-manager',
    '/menu',
    '/menu-builder',
    '/ifood-menu',
    '/technical-sheets',
    '/inventory',
    '/inventory/audit',
    '/inventory/portioning',
    '/requisitions',
    '/purchasing',
    '/employees',
    '/schedules',
    '/leave-management',
    '/payroll',
    '/performance',
    '/settings',
    '/subscription'
  ];

  readonly OPERACAO_PATHS = [
    '/pos',
    '/reservations',
    '/delivery',
    '/whatsapp-chats',
    '/cashier',
    '/kds',
    '/ifood-kds',
    '/mise-en-place',
    '/checklists',
    '/temperatures',
    '/time-clock',
    '/my-leave',
    '/employee-selection'
  ];

  readonly COMMON_PATHS = [
    '/login',
    '/register',
    '/reset-password',
    '/demo',
    '/onboarding',
    '/my-profile',
    '/support',
    '/tutorials'
  ];

  constructor() {
    // Listen for storage changes if open in multiple tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === this.STORAGE_KEY && !this.isDomainLocked()) {
          const newMode = (e.newValue as PortalType) || 'gestao';
          this.currentMode.set(newMode);
        }
      });
    }
  }

  private detectInitialPortalMode(): PortalType {
    if (typeof window === 'undefined') return 'gestao';

    const hostname = window.location.hostname.toLowerCase();

    // Direct domain matching
    if (hostname === this.GESTAO_DOMAIN || hostname.startsWith('portal.')) {
      return 'gestao';
    }
    if (hostname === this.OPERACAO_DOMAIN || hostname.startsWith('app.')) {
      return 'operacao';
    }

    // Saved override for localhost / cloud-run preview
    const saved = localStorage.getItem(this.STORAGE_KEY) as PortalType | null;
    if (saved && ['gestao', 'operacao', 'all'].includes(saved)) {
      return saved;
    }

    return 'gestao'; // Default to Gestão if on dev domain without saved preference
  }

  private checkIfDomainIsLocked(): boolean {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname.toLowerCase();
    return hostname === this.GESTAO_DOMAIN || hostname === this.OPERACAO_DOMAIN;
  }

  setPortalMode(mode: PortalType) {
    this.currentMode.set(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, mode);
    }
  }

  isRouteAllowedInCurrentPortal(routePath: string): boolean {
    const mode = this.currentMode();
    if (mode === 'all') return true;

    // Check common paths
    if (this.COMMON_PATHS.some(p => routePath.startsWith(p))) return true;

    if (mode === 'gestao') {
      return this.GESTAO_PATHS.some(p => routePath === p || routePath.startsWith(p + '/'));
    }

    if (mode === 'operacao') {
      return this.OPERACAO_PATHS.some(p => routePath === p || routePath.startsWith(p + '/'));
    }

    return true;
  }

  getPortalDefaultRoute(portal: 'gestao' | 'operacao'): string {
    return portal === 'gestao' ? '/dashboard' : '/pos';
  }

  getTargetPortalUrl(targetPortal: 'gestao' | 'operacao', targetPath?: string): string {
    const path = targetPath || this.getPortalDefaultRoute(targetPortal);

    if (typeof window === 'undefined') return path;

    const hostname = window.location.hostname.toLowerCase();
    
    // If running in production domain mode:
    if (hostname.endsWith('chefos.online')) {
      const targetDomain = targetPortal === 'gestao' ? this.GESTAO_DOMAIN : this.OPERACAO_DOMAIN;
      const protocol = window.location.protocol;
      return `${protocol}//${targetDomain}${path}`;
    }

    // In preview/dev mode, keep same origin and change simulated mode
    return path;
  }

  switchPortalInDev(targetPortal: 'gestao' | 'operacao' | 'all') {
    this.setPortalMode(targetPortal);
  }
}
