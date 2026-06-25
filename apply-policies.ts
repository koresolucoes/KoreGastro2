import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql: `
CREATE POLICY "Users can view their own agent configs"
ON "public"."whatsapp_agent_configs"
FOR SELECT
USING (auth.uid() = store_id);

CREATE POLICY "Users can insert their own agent configs"
ON "public"."whatsapp_agent_configs"
FOR INSERT
WITH CHECK (auth.uid() = store_id);

CREATE POLICY "Users can update their own agent configs"
ON "public"."whatsapp_agent_configs"
FOR UPDATE
USING (auth.uid() = store_id)
WITH CHECK (auth.uid() = store_id);

ALTER TABLE "public"."whatsapp_agent_configs" ENABLE ROW LEVEL SECURITY;
  ` });
  console.log("Policies:", error);
}
run();
