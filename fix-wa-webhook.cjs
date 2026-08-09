const fs = require('fs');
let content = fs.readFileSync('api/whatsapp/webhook.ts', 'utf8');

// Replace the GET block to use env var for verify token
content = content.replace(
  /if \(mode === "subscribe" && token === "chefos_whatsapp_webhook_2024"\) {/,
  'if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN || "chefos_whatsapp_webhook_2024")) {'
);

// Remove the storeIdQuery logic to prevent hijacking
content = content.replace(
  /const storeIdQuery = req\.query\.storeId as string \| undefined;/,
  'const storeIdQuery = undefined;'
);

// Add signature validation
const sigValidation = `
      // Validate signature
      const signature = req.headers["x-hub-signature-256"];
      if (!signature) return res.status(401).send("Missing signature");
      
      const appSecret = process.env.WHATSAPP_APP_SECRET;
      if (appSecret) {
         const payload = JSON.stringify(body);
         const expectedSignature = "sha256=" + crypto.createHmac("sha256", appSecret).update(payload).digest("hex");
         if (signature !== expectedSignature) {
            return res.status(401).send("Invalid signature");
         }
      }
`;

content = content.replace(
  /const body = req\.body;\n\s*console\.log\("WhatsApp Webhook:", JSON\.stringify\(body\)\);/,
  `const body = req.body;\n      console.log("WhatsApp Webhook:", JSON.stringify(body));\n${sigValidation}`
);

// Need to import crypto
if (!content.includes('import * as crypto')) {
  content = content.replace('import * as dotenv from "dotenv";', 'import * as dotenv from "dotenv";\nimport * as crypto from "crypto";');
}

fs.writeFileSync('api/whatsapp/webhook.ts', content);
