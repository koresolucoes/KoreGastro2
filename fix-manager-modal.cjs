const fs = require('fs');

let content = fs.readFileSync('src/components/shared/manager-auth-modal/manager-auth-modal.component.ts', 'utf8');

content = content.replace(
  "import { HrStateService } from '../../../services/hr-state.service';",
  "import { HrStateService } from '../../../services/hr-state.service';\nimport { OperationalAuthService } from '../../../services/operational-auth.service';\nimport { UnitContextService } from '../../../services/unit-context.service';"
);

content = content.replace(
  "private hrState = inject(HrStateService);",
  "private hrState = inject(HrStateService);\n  private operationalAuth = inject(OperationalAuthService);\n  private unitContextService = inject(UnitContextService);"
);

const verifyPin = `
  private async verifyPin() {
    const enteredPin = this.pin();
    const storeId = this.unitContextService.activeStoreId();
    if (!storeId) {
        this.showError();
        return;
    }

    const { success, employee } = await this.operationalAuth.verifyManagerPin(enteredPin, storeId);

    if (success && employee) {
      this.authorized.emit(employee);
    } else {
      this.showError();
    }
  }
`;

content = content.replace(
  /private verifyPin\(\) \{[\s\S]*?else \{\n\s*this\.showError\(\);\n\s*\}\n\s*\}/,
  verifyPin
);

fs.writeFileSync('src/components/shared/manager-auth-modal/manager-auth-modal.component.ts', content);
