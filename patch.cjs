const fs = require('fs');
let code = fs.readFileSync('src/services/operational-auth.service.ts', 'utf8');

code = code.replace(/  async clockIn\(employee: Employee, location\?: \{ latitude: number; longitude: number \}\): Promise<\{ success: boolean; error: unknown \}> \{[\s\S]*?return \{ success: true, error: null \};\n  \}/, 
`  async clockIn(employee: Employee, location?: { latitude: number; longitude: number }): Promise<{ success: boolean; error: unknown }> {
    if (this.demoService.isDemoMode()) return { success: true, error: null };
    
    if (!location) {
      try {
        location = await this.getCurrentLocation();
      } catch (e) {
        // Ignora erro se não for obrigatório
      }
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    try {
      const res = await firstValueFrom(this.http.post<any>('/api/rh/ponto/bater-ponto', {
        employeeId: employee.id,
        pin: employee.pin,
        restaurantId: employee.user_id,
        latitude: location?.latitude,
        longitude: location?.longitude
      }, {
        headers: token ? { Authorization: \`Bearer \${token}\` } : {}
      }));
      
      // Update local state to reflect clock in
      this.hrState.employees.update(employees => 
          employees.map(e => e.id === employee.id ? { ...e, current_clock_in_id: 'active' } : e)
      );
      const updatedEmployee = { ...employee, current_clock_in_id: 'active' };
      this.login(updatedEmployee);
      
      return { success: true, error: null };
    } catch (error: any) {
      if (error.error?.detail) {
        this.notificationService.show(error.error.detail, 'error');
      }
      return { success: false, error: error.error || error };
    }
  }`);

fs.writeFileSync('src/services/operational-auth.service.ts', code);
