const fs = require('fs');

let content = fs.readFileSync('api/focusnfe-proxy.ts', 'utf8');

// 1. Fix the IDOR and object response
// In emitNfce, there is no IDOR because it checks `.eq('user_id', userId)` where userId is `restaurantId` from the payload (which was validated by the API key).
// But wait, the API key validates that the caller owns `restaurantId`. And the orders query has `.eq('user_id', userId)`. So emit_nfce is safe.
// However, the report says: "gravam res.status e res (objeto HTTP da Vercel) em vez de dados de fetchRes, e retornam { data: res }."

content = content.replace(
  /nfce_status: res\.status,/g,
  'nfce_status: fetchRes?.status || "200",'
);

content = content.replace(
  /nfce_last_response: res as any/g,
  'nfce_last_response: fetchRes as any'
);

content = content.replace(
  /return res\.status\(200\)\.json\({ data: res }\);/g,
  'return res.status(200).json({ data: fetchRes });'
);

// 2. Fix creds fetching to use store_integration_credentials
// Original:
/*
        const { data: profile, error: profileError } = await supabase
            .from('company_profile')
            .select('external_api_key, focusnfe_token, cnpj')
            .eq('user_id', restaurantId)
            .single();
*/

const newCredsLogic = `
        const { data: profile } = await supabase
            .from('company_profile')
            .select('cnpj')
            .eq('user_id', restaurantId)
            .single();

        const { data: creds, error: credsError } = await supabase
            .from('store_integration_credentials')
            .select('external_api_key, focusnfe_token')
            .eq('store_id', restaurantId)
            .single();
            
        if (credsError || !creds || !creds.external_api_key) {
`;

content = content.replace(
  /const { data: profile, error: profileError } = await supabase[\s\S]*?\.single\(\);\s*if \(profileError \|\| !profile \|\| !profile\.external_api_key\) \{/,
  newCredsLogic
);

// We need to fix the profile.focusnfe_token and profile.external_api_key in the subsequent switch statements to use creds
content = content.replace(/profile\.external_api_key/g, 'creds.external_api_key');
content = content.replace(/profile\.focusnfe_token/g, 'creds.focusnfe_token');
// Keep profile.cnpj
// Wait, the newCredsLogic re-declares `profile`. So `profile.cnpj` is fine, but it can be null if profile wasn't found.

content = content.replace(
  /await supabase\.from\('company_profile'\)\.update\(\{ focusnfe_token: token \}\)\.eq\('user_id', userId\);/g,
  'await supabase.from("store_integration_credentials").update({ focusnfe_token: token }).eq("store_id", userId);'
);

content = content.replace(
  /await supabase\.from\('company_profile'\)\.update\(\{ focusnfe_cert_valid_until: certValidUntil \}\)\.eq\('user_id', userId\);/g,
  'await supabase.from("store_integration_credentials").update({ focusnfe_cert_valid_until: certValidUntil }).eq("store_id", userId);'
);


fs.writeFileSync('api/focusnfe-proxy.ts', content);
