const TOKEN_PROPERTY = "MEHFIL_MAIL_RELAY_TOKEN";

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
    if (!expectedToken || payload.token !== expectedToken) {
      return json({ ok: false, error: "Unauthorized mail request." });
    }

    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "MEHFIL event update").replace(/[\r\n]+/g, " ").slice(0, 180);
    const text = String(payload.text || "");
    const html = String(payload.html || "");
    if (!to || !text || !html) {
      return json({ ok: false, error: "Recipient and email content are required." });
    }

    const cacheKey = payload.idempotencyKey
      ? "MEHFIL_SENT_" + Utilities.base64EncodeWebSafe(
          Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(payload.idempotencyKey)),
        ).slice(0, 40)
      : "";
    const cache = CacheService.getScriptCache();
    if (cacheKey && cache.get(cacheKey)) return json({ ok: true, duplicate: true });

    MailApp.sendEmail({ to, subject, body: text, htmlBody: html, name: "MEHFIL" });
    if (cacheKey) cache.put(cacheKey, "sent", 21600);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || "Email could not be sent.") });
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
