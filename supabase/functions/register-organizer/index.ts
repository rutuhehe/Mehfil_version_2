const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(503, { error: "Organizer onboarding is not configured." });
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Sign-in required." });
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json(401, { error: "Session is invalid." });
  if (user.user_metadata?.register_as !== "ORGANIZER") {
    return json(403, { error: "This account did not request organizer access." });
  }

  const { data: profile, error: profileError } = await admin.from("users")
    .select("user_id,role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || !profile.is_active) return json(403, { error: "Active MEHFIL account required." });
  if (profile.role === "ORGANIZER") return json(200, { role: "ORGANIZER" });
  if (profile.role !== "STUDENT") return json(403, { error: "This account cannot be changed to an organizer." });

  const organizationName = String(user.user_metadata?.organization_name || "").trim();
  if (!organizationName) return json(400, { error: "Organization name is required." });
  const { error: updateError } = await admin.from("users").update({
    role: "ORGANIZER",
    organization_name: organizationName,
  }).eq("user_id", user.id);
  if (updateError) return json(500, { error: "Organizer profile could not be activated." });
  return json(200, { role: "ORGANIZER" });
});
