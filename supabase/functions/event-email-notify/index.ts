const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!supabaseUrl || !serviceKey || !resendKey || !from) {
    return json(503, { error: "Email delivery is not configured." });
  }
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Sign-in required." });
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const currentUser = authData?.user;
  if (authError || !currentUser) return json(401, { error: "Session is invalid." });

  let body: { type?: string; eventId?: string; registrationId?: string | null };
  try { body = await request.json(); } catch { return json(400, { error: "Request body must be JSON." }); }
  const allowedTypes = ["registration_confirmed", "registration_cancelled", "event_updated", "event_cancelled"];
  if (!body.eventId || !allowedTypes.includes(body.type || "")) return json(400, { error: "Unsupported email notification." });

  const { data: actor, error: actorError } = await admin.from("users").select("user_id,role,is_active,full_name").eq("user_id", currentUser.id).maybeSingle();
  if (actorError || !actor || !actor.is_active) return json(403, { error: "Active MEHFIL account required." });
  const { data: event, error: eventError } = await admin.from("events")
    .select("event_id,title,description,venue,start_at,status,organizer_id,updated_at")
    .eq("event_id", body.eventId).maybeSingle();
  if (eventError || !event) return json(404, { error: "Event not found." });

  const registrationType = body.type === "registration_confirmed" || body.type === "registration_cancelled";
  let notificationVersion = event.updated_at;
  if (registrationType) {
    let registrationQuery = admin.from("registrations")
      .select("registration_id,student_id,event_id,registration_status")
      .eq("student_id", currentUser.id).eq("event_id", event.event_id)
      .eq("registration_status", body.type === "registration_confirmed" ? "CONFIRMED" : "CANCELLED")
      .order("registered_at", { ascending: false }).limit(1);
    if (body.registrationId) registrationQuery = registrationQuery.eq("registration_id", body.registrationId);
    const { data: rows, error: registrationError } = await registrationQuery;
    if (registrationError || !rows?.[0]) return json(403, { error: "A matching registration could not be verified." });
    notificationVersion = rows[0].registration_id;
  } else {
    const isOwner = actor.role === "ORGANIZER" && event.organizer_id === actor.user_id;
    if (!isOwner && actor.role !== "ADMIN") return json(403, { error: "Only this event's organizer or an administrator can notify attendees." });
    if (body.type === "event_cancelled" && event.status !== "CANCELLED") return json(409, { error: "Cancel the event before sending cancellation notices." });
  }

  let recipients: Array<{ email: string; full_name: string | null }> = [];
  if (registrationType) {
    const { data: person } = await admin.from("users").select("email,full_name").eq("user_id", currentUser.id).maybeSingle();
    if (person?.email) recipients = [person];
  } else {
    const { data: registrations, error: recipientsError } = await admin.from("registrations")
      .select("student_id").eq("event_id", event.event_id).eq("registration_status", "CONFIRMED");
    if (recipientsError) return json(500, { error: "Could not load confirmed attendees." });
    const ids = [...new Set((registrations || []).map((row: { student_id: string }) => row.student_id))];
    if (ids.length) {
      const { data: people, error: peopleError } = await admin.from("users").select("email,full_name")
        .in("user_id", ids).eq("is_active", true);
      if (peopleError) return json(500, { error: "Could not load attendee email addresses." });
      recipients = (people || []).filter((person: { email?: string }) => person.email);
    }
  }
  if (!recipients.length) return json(200, { sent: 0 });

  const subjectByType: Record<string, string> = {
    registration_confirmed: "You're registered: " + event.title,
    registration_cancelled: "Registration cancelled: " + event.title,
    event_updated: "Event details updated: " + event.title,
    event_cancelled: "Event cancelled: " + event.title,
  };
  const messageByType: Record<string, string> = {
    registration_confirmed: "Your place is confirmed. We look forward to seeing you there.",
    registration_cancelled: "Your registration has been cancelled. We hope to see you at another campus event.",
    event_updated: "The organizer has updated this event. Please review the latest details before you go.",
    event_cancelled: "The organizer has cancelled this event. Your registration is no longer active.",
  };
  const detail = new Date(event.start_at).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" }) + (event.venue ? " · " + event.venue : "");
  let sent = 0;
  for (const recipient of recipients) {
    const name = escapeHtml(recipient.full_name || "there");
    const title = escapeHtml(event.title);
    const message = escapeHtml(messageByType[body.type!]);
    const safeDetail = escapeHtml(detail);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json", "Idempotency-Key": ["mehfil", body.type, event.event_id, notificationVersion, recipient.email.toLowerCase()].join(":") },
      body: JSON.stringify({
        from,
        to: [recipient.email],
        subject: subjectByType[body.type!],
        text: "Hi " + (recipient.full_name || "there") + ",\n\n" + messageByType[body.type!] + "\n\n" + event.title + "\n" + detail + "\n\nMEHFIL · Where Campus Comes Together",
        html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:28px;border:1px solid #e8e2ea;border-radius:12px;color:#29272b"><div style="color:#694c7d;font-weight:700;letter-spacing:2px">MEHFIL</div><p>Hi ' + name + ',</p><h1 style="font-size:24px">' + title + '</h1><p>' + message + '</p><p style="color:#716a75">' + safeDetail + '</p><p style="color:#8b7c91;font-size:12px">Where campus comes together.</p></div>',
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      return json(502, { error: "Email provider rejected delivery.", sent, details: details.slice(0, 300) });
    }
    sent++;
  }
  return json(200, { sent });
});

