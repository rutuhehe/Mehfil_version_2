export const ROLES = Object.freeze({ STUDENT: 'STUDENT', ORGANIZER: 'ORGANIZER', ADMIN: 'ADMIN' })

export function canAccessRole(user, allowedRoles = []) {
  return Boolean(user && allowedRoles.includes(user.role))
}

export function dashboardForRole(role) {
  if (role === ROLES.ORGANIZER) return '/organizer'
  if (role === ROLES.ADMIN) return '/admin'
  if (role === ROLES.STUDENT) return '/student'
  return '/events'
}

export function isAvailableEvent(event, now = new Date()) {
  return Boolean(
    event &&
    event.status === 'PUBLISHED' &&
    new Date(event.start_at).getTime() > now.getTime() &&
    (!event.registration_deadline || new Date(event.registration_deadline).getTime() > now.getTime()),
  )
}

export function groupRegistrationsByEvent(events, registrations) {
  const eventIds = new Set(events.map((event) => event.event_id))
  return registrations.reduce((result, registration) => {
    if (!eventIds.has(registration.event_id)) return result
    result[registration.event_id] = [...(result[registration.event_id] || []), registration]
    return result
  }, {})
}

export function filterEvents(events, filters = {}, now = new Date()) {
  const query = (filters.query || '').trim().toLowerCase()
  const from = filters.from ? new Date(filters.from).setHours(0, 0, 0, 0) : null
  const to = filters.to ? new Date(filters.to).setHours(23, 59, 59, 999) : null
  return events.filter((event) => {
    if (query && ![event.title, event.venue, event.department_name, event.description]
      .filter(Boolean).some((value) => value.toLowerCase().includes(query))) return false
    if (filters.category && event.category_name !== filters.category) return false
    if (filters.department && event.department_name !== filters.department) return false
    if (filters.location && event.venue !== filters.location) return false
    if (filters.upcoming && new Date(event.start_at).getTime() < now.getTime()) return false
    if (from && new Date(event.start_at).getTime() < from) return false
    if (to && new Date(event.start_at).getTime() > to) return false
    return true
  }).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
}

