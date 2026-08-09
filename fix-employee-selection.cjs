const fs = require('fs');

let content = fs.readFileSync('src/components/auth/employee-selection.component.ts', 'utf8');

const attemptLogin = `
  async attemptLogin() {
    const employee = this.selectedEmployee();
    if (!employee) return;
    
    // We can't rely on the storeId directly from the state unless we have it.
    // We can use employee.user_id (which is store_id)
    const storeId = employee.user_id;

    const { success, message, opToken } = await this.operationalAuth.verifyPin(employee.id, this.pinInput(), storeId);

    if (success) {
        this.selectedEmployee.set(null); // Close PIN modal
        if (opToken) {
            sessionStorage.setItem('opToken', opToken);
        }
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
`;

content = content.replace(
  /attemptLogin\(\) \{[\s\S]*?\/\/ --- Clock-in Confirmation ---/,
  attemptLogin + '\n  // --- Clock-in Confirmation ---'
);

// We need to also modify selectEmployee to not check employee.pin presence on the client, since it is not returned anymore.
// Or we can leave it to check if it's undefined, wait, if we removed pin from the select, it will be undefined for everyone!
// So employee.pin will ALWAYS be undefined. We must remove that check.
content = content.replace(
  /if \(!employee\.pin \|\| employee\.pin\.trim\(\) === ''\) \{\n\s*this\.notificationService\.show\('Este funcionário não possui um PIN configurado\. Solicite ao gerente\.', 'error'\);\n\s*return;\n\s*\}/,
  ''
);


fs.writeFileSync('src/components/auth/employee-selection.component.ts', content);
