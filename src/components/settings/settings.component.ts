
import { Component, ChangeDetectionStrategy, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

// Import new modular components
import { CompanySettingsComponent } from './company-settings/company-settings.component';
import { OperationSettingsComponent } from './operation-settings/operation-settings.component';
import { FunctionalitySettingsComponent } from './functionality-settings/functionality-settings.component';
import { SecuritySettingsComponent } from './security-settings/security-settings.component';
import { MultiUnitSettingsComponent } from './multi-unit-settings/multi-unit-settings.component';
import { StoreManagementComponent } from './store-management/store-management.component';
import { AppearanceSettingsComponent } from './appearance-settings/appearance-settings.component';

type SettingsTab = 'empresa' | 'stores' | 'aparencia' | 'cadastros' | 'funcionalidades' | 'seguranca' | 'equipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    CompanySettingsComponent,
    OperationSettingsComponent,
    FunctionalitySettingsComponent,
    SecuritySettingsComponent,
    MultiUnitSettingsComponent,
    StoreManagementComponent,
    AppearanceSettingsComponent
  ],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private route: ActivatedRoute = inject(ActivatedRoute);
  private router: Router = inject(Router);

  // Use toSignal to reactively track query params
  private queryParams = toSignal(this.route.queryParams);
  activeTab = signal<SettingsTab>('empresa');
  mobileViewMode = signal<'menu' | 'detail'>('menu');

  constructor() {
    effect(() => {
        const params = this.queryParams();
        const tabFromUrl = params?.['tab'] as SettingsTab;
        if (tabFromUrl && ['empresa', 'stores', 'aparencia', 'cadastros', 'funcionalidades', 'seguranca', 'equipe'].includes(tabFromUrl)) {
            // Only update if different to avoid cycles
            if (this.activeTab() !== tabFromUrl) {
                this.activeTab.set(tabFromUrl);
            }
            // Automatically switch to detail view on mobile if deep-linked
            this.mobileViewMode.set('detail');
        } else {
            // If no valid tab in URL (e.g. root /settings), show menu on mobile
            this.mobileViewMode.set('menu');
        }
    }, { allowSignalWrites: true });
  }

  selectTab(tab: SettingsTab) {
    this.activeTab.set(tab);
    this.mobileViewMode.set('detail');
    // Update URL without reloading the page to persist state
    this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: tab },
        queryParamsHandling: 'merge', // keep other params if any
        replaceUrl: true // don't clutter browser history
    });
  }

  goBackToMenu() {
    this.mobileViewMode.set('menu');
    this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: undefined },
        queryParamsHandling: 'merge',
        replaceUrl: true
    });
  }
  
  getActiveTabLabel(): string {
    switch(this.activeTab()) {
       case 'empresa': return 'Dados da Empresa';
       case 'stores': return 'Minhas Lojas';
       case 'aparencia': return 'Aparência e Temas';
       case 'equipe': return 'Gestão de Equipe';
       case 'cadastros': return 'Cadastros Base';
       case 'funcionalidades': return 'Módulos & Integrações';
       case 'seguranca': return 'Cargos & Permissões';
       default: return 'Configurações';
    }
  }
}
