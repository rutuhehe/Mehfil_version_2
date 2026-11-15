export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date to be announced' : date.toLocaleDateString(undefined, options)
}

export function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function friendlyError(error) {
  const text = String(error?.message || error || 'Something went wrong.')
  if (/invalid login credentials/i.test(text)) return 'That email and password do not match.'
  if (/user already registered|already exists/i.test(text)) return 'An account with that email already exists.'
  if (/event_full|capacity/i.test(text)) return 'This event has reached capacity.'
  if (/schedule|clash/i.test(text)) return 'This event overlaps with another confirmed registration.'
  if (/already registered/i.test(text)) return 'You already have a confirmed registration.'
  if (/deadline/i.test(text)) return 'The registration deadline has passed.'
  if (/unavailable|cancelled|canceled|completed/i.test(text)) return 'This event is no longer available for registration.'
  if (/failed to fetch|network/i.test(text)) return 'Could not reach the service. Check your connection and try again.'
  return text
}
