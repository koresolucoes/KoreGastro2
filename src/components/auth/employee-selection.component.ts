
import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../models/db.models';
import { SupabaseStateService } from '../../services/supabase-state.service';
import { SubscriptionStateService } from '../../services/subscription-state.service';
import { HrStateService } from '../../services/hr-state.service';
import { OperationalAuthService } from '../../services/operational-auth.service';
import { SettingsDataService } from '../../services/settings-data.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { Html5Qrcode } from 'html5-qrcode';

@Component({
  selector: 'app-employee-selection',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './employee-selection.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeSelectionComponent implements OnDestroy {
  @ViewChild('reader', { static: false }) readerElement?: ElementRef;
  html5QrCode: Html5Qrcode | null = null;
  private stateService = inject(SupabaseStateService);
  private operationalAuth = inject(OperationalAuthService);
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private router: Router = inject(Router);
  private subscriptionState = inject(SubscriptionStateService);
  private hrState = inject(HrStateService);

  private authService = inject(AuthService);

  hasActiveSubscription = this.subscriptionState.hasActiveSubscription;

  async logoutAdmin() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
  isDataLoaded = this.stateService.isDataLoaded;
  isTrialing = this.subscriptionState.isTrialing;
  trialDaysRemaining = this.subscriptionState.trialDaysRemaining;

  employees = computed(() => {
    const rolesMap = new Map(this.hrState.roles().map(r => [r.id, r.name]));
    return this.hrState.employees().map(e => ({
      ...e,
      role: e.role_id ? rolesMap.get(e.role_id) || 'Sem Cargo' : 'Sem Cargo'
    }));
  });
  
  // States for different stages
  searchQuery = signal('');
  searchResults = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return [];
    
    // Exact match on matricula
    const exactMatricula = this.employees().filter(e => e.bank_details?.matricula && e.bank_details.matricula.toLowerCase() === query);
    if (exactMatricula.length === 1) return exactMatricula;

    return this.employees().filter(e => 
      (e.bank_details?.matricula && e.bank_details.matricula.toLowerCase().includes(query)) ||
      (e.cpf && e.cpf.replace(/\D/g, '').includes(query.replace(/\D/g, ''))) ||
      e.name.toLowerCase().includes(query)
    );
  });

  selectedEmployee = signal<Employee | null>(null); // For PIN entry
  confirmationEmployee = signal<Employee | null>(null); // For clock-in confirmation

  isScanningQR = signal(false);

  pinInput = signal('');
  loginError = signal(false);
  pinDisplay = computed(() => '●'.repeat(this.pinInput().length));

  constructor() {
    effect(() => {
        // Se os dados foram carregados e não há funcionários, redirecionar para onboarding
        if (this.isDataLoaded() && this.employees().length === 0) {
            this.router.navigate(['/onboarding']);
        }
    });
    
    // Auto-select if there's an exact match on matricula and it's unique
    effect(() => {
       const query = this.searchQuery().trim();
       if (query && !this.selectedEmployee()) {
         const exact = this.employees().find(e => e.bank_details?.matricula && e.bank_details.matricula.toLowerCase() === query.toLowerCase());
         if (exact) {
             this.selectEmployee(exact);
         }
       }
    }, { allowSignalWrites: true });
  }

  selectEmployee(employee: Employee) {
    if (!employee.pin || employee.pin.trim() === '') {
        this.notificationService.show('Este funcionário não possui um PIN configurado. Solicite ao gerente.', 'error');
        return;
    }
    // PIN required, show PIN modal
    this.selectedEmployee.set(employee);
    this.searchQuery.set('');
    this.pinInput.set('');
    this.loginError.set(false);
  }
  
  private handleSuccessfulLogin(employee: Employee) {
    this.operationalAuth.login(employee);
    const defaultRoute = this.operationalAuth.getDefaultRoute();
    this.router.navigate([defaultRoute]);
  }

  ngOnDestroy() {
    this.stopScanner();
  }

  toggleScanner() {
    if (this.isScanningQR()) {
        this.stopScanner();
    } else {
        this.isScanningQR.set(true);
        setTimeout(() => this.startScanner(), 100);
    }
  }

  async startScanner() {
    try {
        this.html5QrCode = new Html5Qrcode('qr-reader');
        await this.html5QrCode.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => this.onScanSuccess(decodedText),
            (errorMessage) => {
                // parse errors are ignored
            }
        );
    } catch (err) {
        console.error('Failed to start scanner:', err);
        this.notificationService.alert('Não foi possível iniciar a câmera.');
        this.stopScanner();
    }
  }

  stopScanner() {
    if (this.html5QrCode && this.html5QrCode.isScanning) {
        this.html5QrCode.stop().then(() => {
            this.html5QrCode?.clear();
        }).catch(err => console.error('Failed to stop scanner:', err));
    }
    this.isScanningQR.set(false);
  }

  onScanSuccess(decodedText: string) {
      // The QR code contains the matricula
      this.searchQuery.set(decodedText);
      this.stopScanner();
  }

  cancelPinLogin() {
    this.selectedEmployee.set(null);
    this.pinInput.set('');
    this.loginError.set(false);
  }

  handlePinInput(digit: string) {
    if (this.pinInput().length < 4) {
      this.pinInput.update(pin => pin + digit);
      if (this.pinInput().length === 4) {
        this.attemptLogin();
      }
    }
  }

  clearPin() {
    this.pinInput.set('');
    this.loginError.set(false);
  }

  attemptLogin() {
    const employee = this.selectedEmployee();
    if (this.pinInput() === employee?.pin) {
        this.selectedEmployee.set(null); // Close PIN modal
        if (!employee.current_clock_in_id) {
            // Correct PIN, not clocked in -> show clock-in confirmation
            this.confirmationEmployee.set(employee);
        } else {
            // Correct PIN, already clocked in -> just log in
            this.handleSuccessfulLogin(employee);
        }
    } else {
        this.loginError.set(true);
        setTimeout(() => this.clearPin(), 800);
    }
  }
  
  // --- Clock-in Confirmation ---
  async confirmClockIn() {
    const employee = this.confirmationEmployee();
    if (!employee) return;
    
    const { success, error } = await this.operationalAuth.clockIn(employee);
    if (success) {
        // The service now handles login and state update
        const defaultRoute = this.operationalAuth.getDefaultRoute();
        this.router.navigate([defaultRoute]);
    } else {
        this.notificationService.show(`Erro ao iniciar turno: ${error?.message}`, 'error');
    }
    this.confirmationEmployee.set(null);
  }

  cancelClockInConfirmation() {
    this.confirmationEmployee.set(null);
  }
}
