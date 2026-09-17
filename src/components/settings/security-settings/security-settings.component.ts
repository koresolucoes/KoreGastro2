import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Role } from '../../../models/db.models';
import { SettingsDataService } from '../../../services/settings-data.service';
import { NotificationService } from '../../../services/notification.service';
import { OPERATIONAL_PERMISSION_KEYS } from '../../../config/permissions';
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
  private hrState = inject(HrStateService);

  roles = this.hrState.roles;
  rolePermissions = this.hrState.rolePermissions;

  allPermissions = OPERATIONAL_PERMISSION_KEYS;

  /**
   * IAM v3: this screen manages Employee Role authority only. Management
   * permissions (employees.manage, store.manage_members, billing.manage, etc.)
   * belong to StoreMembership and must not be written to role_permissions.
   */
  private allPermissionGroups = [
    {
      name: 'Atendimento & Vendas',
      permissions: [
        { key: 'pos.use', label: 'Usar PDV' },
        { key: 'cashier.use', label: 'Usar Caixa' },
        { key: 'delivery.use', label: 'Operar Delivery' },
      ],
    },
    {
      name: 'Produção',
      permissions: [
        { key: 'kds.use', label: 'Usar KDS / Cozinha' },
        { key: 'production.use', label: 'Operar Produção / Mise en Place' },
      ],
    },
    {
      name: 'Rotinas Operacionais',
      permissions: [
        { key: 'checklists.use', label: 'Executar Checklists' },
        { key: 'temperatures.use', label: 'Registrar Temperaturas' },
      ],
    },
    {
      name: 'Comunicação',
      permissions: [
        { key: 'whatsapp.use', label: 'Operar WhatsApp' },
      ],
    },
    {
      name: 'Autogestão do Colaborador',
      permissions: [
        { key: 'employee.self', label: 'Acessar Meu RH / Perfil / Ponto' },
        { key: 'timeclock.report', label: 'Consultar relatório de ponto operacional' },
      ],
    },
  ] satisfies Array<{
    name: string;
    permissions: Array<{ key: (typeof OPERATIONAL_PERMISSION_KEYS)[number]; label: string }>;
  }>;

  /**
   * Visibility of capabilities is not derived from the current employee Role.
   * The page-level management guard decides who may administer Roles. This
   * avoids the old circular rule where a Role name such as "Gerente" granted
   * implicit authority to edit or see every permission.
   */
  permissionGroups = computed(() => this.allPermissionGroups);

  isPermissionsModalOpen = signal(false);
  editingRole = signal<Role | null>(null);
  rolePermissionsForm = signal<Record<string, boolean>>({});
  newRoleName = signal('');
  rolePendingDeletion = signal<Role | null>(null);

  openPermissionsModal(role: Role) {
    this.editingRole.set(role);
    const currentPermissions = new Set(
      this.rolePermissions()
        .filter(p => p.role_id === role.id)
        .map(p => p.permission_key),
    );
    const formState: Record<string, boolean> = {};

    for (const key of OPERATIONAL_PERMISSION_KEYS) {
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
    if (!(OPERATIONAL_PERMISSION_KEYS as readonly string[]).includes(key)) return;
    this.rolePermissionsForm.update(form => ({ ...form, [key]: isChecked }));
  }

  async savePermissions() {
    const role = this.editingRole();
    if (!role) return;

    const canonical = new Set<string>(OPERATIONAL_PERMISSION_KEYS);
    const permissions = Object.entries(this.rolePermissionsForm())
      .filter(([key, isEnabled]) => isEnabled && canonical.has(key))
      .map(([key]) => key);

    const { success, error } = await this.settingsDataService.updateRolePermissions(role.id, permissions);
    if (success) {
      this.closePermissionsModal();
    } else {
      await this.notificationService.alert(`Erro ao salvar permissões: ${error?.message}`);
    }
  }

  async handleAddRole() {
    const { confirmed, value: roleName } = await this.notificationService.prompt(
      'Qual o nome do novo cargo?',
      'Novo Cargo',
      { placeholder: 'Ex: Cozinha' },
    );
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
