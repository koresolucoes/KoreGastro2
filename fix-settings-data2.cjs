const fs = require('fs');

let content = fs.readFileSync('src/services/settings-data.service.ts', 'utf8');

const getCompanyProfile = `
  async getCompanyProfile(): Promise<{ data: CompanyProfile | null; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId)
      return { data: null, error: { message: "Active unit not found" } };

    const { data: profile, error } = await supabase
      .from("company_profile")
      .select("id, user_id, company_name, cnpj, address, phone, latitude, longitude, time_clock_radius")
      .eq("user_id", userId)
      .single();

    if (error || !profile) return { data: null, error };

    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.access_token) {
        const res = await fetch(\`/api/v2/credentials?storeId=\${userId}\`, {
          headers: { 'Authorization': \`Bearer \${session.session.access_token}\` }
        });
        const credsData = await res.json();
        if (credsData.credentials) {
            Object.assign(profile, credsData.credentials);
        }
      }
    } catch (e) {
      console.error('Failed to fetch masked credentials', e);
    }

    return { data: profile, error: null };
  }
`;

content = content.replace(
  /async getCompanyProfile\(\)[\s\S]*?return \{ data: (?:profile\|\|null|profile), error \};\n\s*\}/,
  getCompanyProfile
);

// We should also modify updateCompanyProfile to not send credentials, or only update them if they don't start with "APP_USR-••••" or "••••"
const updateProfile = `
  async updateCompanyProfile(profileData: Partial<CompanyProfile>): Promise<{ success: boolean; error: any }> {
    const userId = this.getActiveUnitId();
    if (!userId)
      return { success: false, error: { message: "Active unit not found" } };

    const { ifood_merchant_id, external_api_key, mp_access_token, mp_refresh_token, mp_public_key, focusnfe_token, focusnfe_cert_valid_until, has_mp_integration, has_focusnfe_integration, ...publicData } = profileData;

    const { error } = await supabase
      .from("company_profile")
      .upsert({ ...publicData, user_id: userId }, { onConflict: "user_id" });

    const credsUpdate: any = { store_id: userId };
    let hasCredsUpdate = false;
    if (ifood_merchant_id !== undefined) { credsUpdate.ifood_merchant_id = ifood_merchant_id; hasCredsUpdate = true; }
    if (external_api_key && !external_api_key.includes('••••')) { credsUpdate.external_api_key = external_api_key; hasCredsUpdate = true; }
    if (mp_access_token && !mp_access_token.includes('••••')) { credsUpdate.mp_access_token = mp_access_token; hasCredsUpdate = true; }
    if (mp_refresh_token && !mp_refresh_token.includes('••••')) { credsUpdate.mp_refresh_token = mp_refresh_token; hasCredsUpdate = true; }

    if (hasCredsUpdate) {
       await this.supabase.rpc('update_store_credentials', { p_store_id: userId, p_credentials: credsUpdate });
    }

    if (!error) {
       this.auditService.logAction('COMPANY_PROFILE_UPDATED', \`Perfil da empresa atualizado\`);
    }
    return { success: !error, error };
  }
`;

content = content.replace(
  /async updateCompanyProfile\([\s\S]*?return \{ success: !error, error \};\n\s*\}/,
  updateProfile
);

fs.writeFileSync('src/services/settings-data.service.ts', content);
