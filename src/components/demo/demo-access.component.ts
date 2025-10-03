
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DemoService } from '../../services/demo.service';

@Component({
  selector: 'app-demo-access',
  standalone: true,
  templateUrl: './demo-access.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoAccessComponent {
  private demoService = inject(DemoService);
  // FIX: Explicitly type the injected Router to resolve property access errors.
  private router: Router = inject(Router);

  startDemo() {
    this.demoService.enableDemoMode();
    // A lógica de auto-login e carregamento de dados mockados será acionada
    // pelos effects nos serviços `OperationalAuthService` e `SupabaseStateService`.
    this.router.navigate(['/dashboard']);
  }
}