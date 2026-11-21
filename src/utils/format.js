export function sanitizeAlphabeticText(value) {
  return String(value ?? '').replace(/[^\p{L}\p{M}\s]/gu, '')
}

export function isAlphabeticText(value) {
  return /^[\p{L}\p{M}\s]*$/u.test(String(value ?? ''))
}

export function sanitizePhoneNumber(value) {
  const text = String(value ?? '')
  const hasInternationalPrefix = text.trimStart().startsWith('+')
  const digits = text.replace(/\D/g, '')
  return (hasInternationalPrefix ? '+' : '') + digits
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date to be announced' : date.toLocaleDateString(undefined, options)
}

export function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export const CAMPUS_TIME_ZONE = 'Asia/Kolkata'

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]))
}

export function dateTimeLocalForZone(value, timeZone = CAMPUS_TIME_ZONE) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = getTimeZoneParts(date, timeZone)
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute
}

export function dateTimeInZoneFromLocal(value, timeZone = CAMPUS_TIME_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  const wantedWallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  let instant = wantedWallTime

  // Resolve a wall-clock value in the chosen IANA zone, independent of the device zone.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getTimeZoneParts(new Date(instant), timeZone)
    const representedWallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const adjustment = wantedWallTime - representedWallTime
    instant += adjustment
    if (adjustment === 0) return new Date(instant)
  }
  return null
}

export function dateTimeLocalToISOString(value, timeZone = CAMPUS_TIME_ZONE) {
  return dateTimeInZoneFromLocal(value, timeZone)?.toISOString() || null
}

export function friendlyError(error) {
  const text = String(error?.message || error || 'Something went wrong.')
  if (/invalid login credentials/i.test(text)) return 'That email and password do not match.'
  if (/email_address_not_authorized|email address.*not authorized/i.test(text)) return 'Supabase’s built-in email service cannot send to this address. Configure custom SMTP in the project’s Authentication settings to deliver confirmation emails to users.'
  if (/roll\s*(?:number|number)\s*already exists/i.test(text)) return 'Roll Number already exists'
  if (/(?:student_number|student number|roll no|roll number)/i.test(text) && /duplicate|unique|already exists/i.test(text)) return 'Roll No already exists'
  if (/user already registered|already exists/i.test(text)) return 'An account with that email already exists.'
  if (/event_full|capacity/i.test(text)) return 'This event has reached capacity.'
  if (/schedule|clash/i.test(text)) return 'This event overlaps with another confirmed registration.'
  if (/already registered/i.test(text)) return 'You already have a confirmed registration.'
  if (/deadline/i.test(text)) return 'The registration deadline has passed.'
  if (/unavailable|cancelled|canceled|completed/i.test(text)) return 'This event is no longer available for registration.'
  if (/failed to fetch|network/i.test(text)) return 'Could not reach the service. Check your connection and try again.'
  return text
}
