const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(503, { error: "Account management is not configured." });

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Sign-in required." });

  let body: { userId?: string };
  try { body = await request.json(); } catch { return json(400, { error: "A user ID is required." }); }
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return json(400, { error: "A valid user ID is required." });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const actor = authData?.user;
  if (authError || !actor) return json(401, { error: "Session is invalid." });
  if (actor.id === targetUserId) return json(409, { error: "You cannot delete the admin account you are currently using." });

  const { data: actorProfile, error: actorProfileError } = await admin.from("users")
    .select("role,is_active").eq("user_id", actor.id).maybeSingle();
  if (actorProfileError) {
    console.error("admin-delete-user: could not read the administrator profile", actorProfileError);
    return json(500, { error: "The delete function could not read public.users. Check its service-role key and SELECT permission for the service_role database role." });
  }
  if (!actorProfile || actorProfile.role !== "ADMIN" || actorProfile.is_active !== true) {
    return json(403, { error: "An active administrator account is required." });
  }

  const { data: targetProfile, error: targetProfileError } = await admin.from("users")
    .select("role,is_active").eq("user_id", targetUserId).maybeSingle();
  if (targetProfileError) return json(500, { error: "The account could not be checked." });

  if (targetProfile?.role === "ADMIN" && targetProfile.is_active) {
    const { count, error: countError } = await admin.from("users")
      .select("user_id", { count: "exact", head: true }).eq("role", "ADMIN").eq("is_active", true);
    if (countError) return json(500, { error: "Administrator access could not be checked." });
    if ((count || 0) <= 1) return json(409, { error: "You cannot delete the only active administrator account." });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    const code = (deleteError as { code?: string }).code;
    if (code === "23503" || /foreign key|constraint/i.test(deleteError.message)) {
      return json(409, { error: "This account is linked to campus records and could not be deleted. Deactivate it or remove its linked records first." });
    }
    if (/not found|user.*does not exist/i.test(deleteError.message)) {
      return json(404, { error: "The account no longer exists." });
    }
    return json(500, { error: "The account could not be deleted. Please try again or contact a campus administrator." });
  }
  return json(200, { deleted: true });
});
