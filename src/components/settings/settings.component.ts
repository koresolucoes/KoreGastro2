
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

type SettingsTab = 'empresa' | 'stores' | 'cadastros' | 'funcionalidades' | 'seguranca' | 'equipe';

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
    StoreManagementComponent
  ],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Use toSignal to reactively track query params
  private queryParams = toSignal(this.route.queryParams);
  activeTab = signal<SettingsTab>('empresa');

  constructor() {
    effect(() => {
        const params = this.queryParams();
        const tabFromUrl = params?.['tab'] as SettingsTab;
        if (tabFromUrl && ['empresa', 'stores', 'cadastros', 'funcionalidades', 'seguranca', 'equipe'].includes(tabFromUrl)) {
            // Only update if different to avoid cycles
            if (this.activeTab() !== tabFromUrl) {
                this.activeTab.set(tabFromUrl);
            }
        }
    });
  }

  selectTab(tab: SettingsTab) {
    this.activeTab.set(tab);
    // Update URL without reloading the page to persist state
    this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: tab },
        queryParamsHandling: 'merge', // keep other params if any
        replaceUrl: true // don't clutter browser history
    });
  }
}
