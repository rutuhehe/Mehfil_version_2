const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-region",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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
  let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    try {
      const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      serviceKey = secretKeys.default;
    } catch (error) {
      console.error("Could not read the injected Supabase secret keys.", error);
    }
  }
  const mailRelayUrl = Deno.env.get("GMAIL_RELAY_URL");
  const mailRelaySecret = Deno.env.get("GMAIL_RELAY_SECRET");
  const missingConfiguration = [
    !supabaseUrl && "SUPABASE_URL",
    !serviceKey && "Supabase service-role key",
    !mailRelayUrl && "GMAIL_RELAY_URL",
    !mailRelaySecret && "GMAIL_RELAY_SECRET",
  ].filter(Boolean);
  if (missingConfiguration.length) {
    console.error("Email function configuration is missing:", missingConfiguration.join(", "));
    return json(503, { error: "Email delivery is missing configuration: " + missingConfiguration.join(", ") + "." });
  }
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "Sign-in required." });
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const currentUser = authData?.user;
  if (authError || !currentUser) return json(401, { error: "Session is invalid." });

  let body: { type?: string; eventId?: string; registrationId?: string | null; emailAttemptId?: string | null };
  try { body = await request.json(); } catch { return json(400, { error: "Request body must be JSON." }); }
  const allowedTypes = ["registration_confirmed", "registration_cancelled", "event_updated", "event_cancelled"];
  if (!body.eventId || !allowedTypes.includes(body.type || "")) return json(400, { error: "Unsupported email notification." });

  const { data: actor, error: actorError } = await admin.from("users").select("user_id,role,is_active,full_name").eq("user_id", currentUser.id).maybeSingle();
  if (actorError || !actor || !actor.is_active) return json(403, { error: "Active MEHFIL account required." });
  const { data: event, error: eventError } = await admin.from("events")
    .select("event_id,title,description,venue,start_at,status,organizer_id")
    .eq("event_id", body.eventId).maybeSingle();
  if (eventError) {
    console.error("Could not load the event for an email notification.", eventError);
    return json(500, { error: "Could not load event details for this email." });
  }
  if (!event) return json(404, { error: "Event not found." });

  const registrationType = body.type === "registration_confirmed" || body.type === "registration_cancelled";
  let notificationVersion = JSON.stringify([event.status, event.title, event.description, event.venue, event.start_at]);
  let emailRegistrationId: string | null = null;
  if (registrationType) {
    let registrationQuery = admin.from("registrations")
      .select("registration_id,student_id,event_id,registration_status")
      .eq("student_id", currentUser.id).eq("event_id", event.event_id)
      .eq("registration_status", body.type === "registration_confirmed" ? "CONFIRMED" : "CANCELLED")
      .order("registered_at", { ascending: false }).limit(1);
    if (body.registrationId) registrationQuery = registrationQuery.eq("registration_id", body.registrationId);
    const { data: rows, error: registrationError } = await registrationQuery;
    if (registrationError) {
      console.error("Could not verify the registration for an email notification.", registrationError);
      return json(500, { error: "Could not check registration details for this email." });
    }
    if (!rows?.[0]) return json(403, { error: "No confirmed registration matched this account, event, and registration ID." });
    notificationVersion = rows[0].registration_id;
    emailRegistrationId = rows[0].registration_id;
  } else {
    const isOwner = actor.role === "ORGANIZER" && event.organizer_id === actor.user_id;
    if (!isOwner && actor.role !== "ADMIN") return json(403, { error: "Only this event's organizer or an administrator can notify attendees." });
    if (body.type === "event_cancelled" && event.status !== "CANCELLED") return json(409, { error: "Cancel the event before sending cancellation notices." });
  }

  let recipients: Array<{ email: string; full_name: string | null }> = [];
  if (registrationType) {
    const { data: person } = await admin.from("users").select("email,full_name").eq("user_id", currentUser.id).maybeSingle();
    const email = person?.email || currentUser.email;
    if (email) recipients = [{ email, full_name: person?.full_name || currentUser.user_metadata?.full_name || null }];
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
  if (!recipients.length) {
    if (registrationType) return json(422, { error: "No email address is available for this account." });
    return json(200, { sent: 0 });
  }

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
    const safeRegistrationId = escapeHtml(emailRegistrationId);
    const registrationText = emailRegistrationId ? "Registration ID: " + emailRegistrationId + "\n\n" : "";
    const checkInNote = body.type === "registration_confirmed" ? '<p style="color:#716a75;font-size:12px">Show this ID to the organizer at check-in.</p>' : '';
    const registrationHtml = emailRegistrationId ? '<p style="margin:20px 0 6px;color:#716a75;font-size:12px">REGISTRATION ID</p><p style="margin:0;padding:12px 14px;background:#f4f1f6;border-radius:8px;font-family:monospace;font-size:14px;overflow-wrap:anywhere">' + safeRegistrationId + '</p>' + checkInNote : '';
    const response = await fetch(mailRelayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: mailRelaySecret,
        idempotencyKey: ["mehfil", body.type, event.event_id, notificationVersion, body.emailAttemptId || "initial", recipient.email.toLowerCase()].join(":"),
        to: recipient.email,
        subject: subjectByType[body.type!],
        text: "Hi " + (recipient.full_name || "there") + ",\n\n" + messageByType[body.type!] + "\n\n" + event.title + "\n" + detail + "\n\n" + registrationText + "MEHFIL · Where Campus Comes Together",
        html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:28px;border:1px solid #e8e2ea;border-radius:12px;color:#29272b"><div style="color:#694c7d;font-weight:700;letter-spacing:2px">MEHFIL</div><p>Hi ' + name + ',</p><h1 style="font-size:24px">' + title + '</h1><p>' + message + '</p><p style="color:#716a75">' + safeDetail + '</p>' + registrationHtml + '<p style="color:#8b7c91;font-size:12px">Where campus comes together.</p></div>',
      }),
    });
    const relayText = await response.text();
    let relayResult: { ok?: boolean; error?: string } | null = null;
    try { relayResult = JSON.parse(relayText); } catch {}
    if (!response.ok || relayResult?.ok !== true) {
      console.error("Gmail email relay rejected delivery.", {
        status: response.status,
        contentType: response.headers.get("content-type"),
        responsePreview: relayText.slice(0, 500),
      });
      return json(502, { error: relayResult?.error || "Gmail email relay rejected delivery.", sent });
    }
    sent++;
  }
  return json(200, { sent });
});

