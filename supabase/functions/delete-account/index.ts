const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-region",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(503, { error: "Account deletion is not configured." });
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Sign-in required." });
  let body: { confirm?: boolean };
  try { body = await request.json(); } catch { return json(400, { error: "Confirmation is required." }); }
  if (body.confirm !== true) return json(400, { error: "Confirmation is required." });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: "Session is invalid." });

  const { error: deleteError } = await admin.auth.admin.deleteUser(authData.user.id);
  if (deleteError) {
    const code = (deleteError as { code?: string }).code;
    if (code === "23503" || /foreign key|constraint/i.test(deleteError.message)) {
      return json(409, { error: "This account is linked to campus records and could not be deleted. Please contact a campus administrator." });
    }
    return json(500, { error: "The account could not be deleted. Please try again or contact a campus administrator." });
  }
  return json(200, { deleted: true });
});
