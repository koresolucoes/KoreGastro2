import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Role } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { ALL_PERMISSION_KEYS } from '../../../config/permissions';
import { OperationalAuthService } from '../../../services/operational-auth.service';
import { HrStateService } from '../../../services/hr-state.service';

@Component({
  selector: 'app-security-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './security-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecuritySettingsComponent {
  private settingsDataService = inject(SettingsDataService);
  private notificationService = inject(NotificationService);
  private operationalAuthService = inject(OperationalAuthService);
  private hrState = inject(HrStateService);

  roles = this.hrState.roles;
  rolePermissions = this.hrState.rolePermissions;
  
  allPermissions = ALL_PERMISSION_KEYS;
  
  private allPermissionGroups = [
    { name: 'Vendas', permissions: [ { key: '/pos', label: 'PDV' }, { key: '/cashier', label: 'Caixa' }, { key: '/reservations', label: 'Reservas' }, { key: '/customers', label: 'Clientes' } ] },
    { name: 'Delivery', permissions: [ { key: '/delivery', label: 'Painel de Delivery' } ] },
    { name: 'iFood', permissions: [ { key: '/ifood-kds', label: 'KDS Delivery' }, { key: '/ifood-menu', label: 'Cardápio iFood' }, { key: '/ifood-store-manager', label: 'Gestor de Loja' } ] },
    { name: 'Produção', permissions: [ { key: '/kds', label: 'Cozinha (KDS)' }, { key: '/mise-en-place', label: 'Mise en Place' }, { key: '/technical-sheets', label: 'Fichas Técnicas' } ] },
    { name: 'Gestão', permissions: [ { key: '/dashboard', label: 'Dashboard' }, { key: '/inventory', label: 'Estoque' }, { key: '/purchasing', label: 'Compras' }, { key: '/suppliers', label: 'Fornecedores' }, { key: '/performance', label: 'Desempenho' }, { key: '/reports', label: 'Relatórios' } ] },
    { name: 'RH', permissions: [ { key: '/employees', label: 'Funcionários' }, { key: '/schedules', label: 'Escalas' }, { key: '/my-leave', label: 'Minhas Ausências' }, { key: '/leave-management', label: 'Gestão de Ausências' }, { key: '/time-clock', label: 'Controle de Ponto' }, { key: '/payroll', label: 'Folha de Pagamento' } ] },
    { name: 'Outros', permissions: [ { key: '/menu', label: 'Cardápio Online' }, { key: '/my-profile', label: 'Meu Perfil' }, { key: '/tutorials', label: 'Tutoriais' }, { key: '/settings', label: 'Configurações' } ] }
  ];

  userAvailablePermissions = computed(() => {
    const activeEmployee = this.operationalAuthService.activeEmployee();
    if (!activeEmployee || !activeEmployee.role_id) return new Set<string>();
    return new Set(this.rolePermissions().filter(p => p.role_id === activeEmployee.role_id).map(p => p.permission_key));
  });

  permissionGroups = computed(() => {
    const isGerente = this.operationalAuthService.activeEmployee()?.role === 'Gerente';
    if (isGerente) return this.allPermissionGroups;
    const available = this.userAvailablePermissions();
    return this.allPermissionGroups.map(group => ({
        ...group,
        permissions: group.permissions.filter(p => available.has(p.key))
    })).filter(group => group.permissions.length > 0);
  });

  isPermissionsModalOpen = signal(false);
  editingRole = signal<Role | null>(null);
  rolePermissionsForm = signal<Record<string, boolean>>({});
  newRoleName = signal('');
  rolePendingDeletion = signal<Role | null>(null);

  openPermissionsModal(role: Role) {
    this.editingRole.set(role);
    const currentPermissions = new Set(this.rolePermissions().filter(p => p.role_id === role.id).map(p => p.permission_key));
    const formState: Record<string, boolean> = {};
    for (const key of this.allPermissions) {
      formState[key] = currentPermissions.has(key);
    }
    this.rolePermissionsForm.set(formState);
    this.isPermissionsModalOpen.set(true);
  }

  closePermissionsModal() {
    this.isPermissionsModalOpen.set(false);
    this.editingRole.set(null);
  }

  updatePermission(key: string, isChecked: boolean) {
    this.rolePermissionsForm.update(form => ({ ...form, [key]: isChecked }));
  }

  async savePermissions() {
    const role = this.editingRole();
    const activeEmployee = this.operationalAuthService.activeEmployee();
    if (!role || !activeEmployee?.role_id) return;
    
    const permissions = Object.entries(this.rolePermissionsForm()).filter(([, isEnabled]) => isEnabled).map(([key]) => key);

    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, permissions, activeEmployee.role_id);
    if (success) {
      this.closePermissionsModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar permissões: ${error?.message}`);
    }
  }

  async handleAddRole() {
    const { confirmed, value: roleName } = await this.notificationService.prompt('Qual o nome do novo cargo?', 'Novo Cargo', { placeholder: 'Ex: Cozinha' });
    if (confirmed && roleName) {
      const { success, error } = await this.settingsDataService.addRole(roleName);
      if (!success) await this.notificationService.alert(`Erro ao criar cargo: ${error?.message}`);
    }
  }

  requestDeleteRole(role: Role) { this.rolePendingDeletion.set(role); }
  cancelDeleteRole() { this.rolePendingDeletion.set(null); }
  async confirmDeleteRole() {
    const role = this.rolePendingDeletion();
    if (role) {
      const { success, error } = await this.settingsDataService.deleteRole(role.id);
      if (!success) await this.notificationService.alert(`Erro ao deletar cargo: ${error?.message}`);
      this.rolePendingDeletion.set(null);
    }
  }
}
