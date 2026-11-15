import { describe, expect, it } from 'vitest'
import { canAccessRole, dashboardForRole, filterEvents, groupRegistrationsByEvent, isAvailableEvent, ROLES } from './events'
import { getSavedEvents, toggleSavedEvent } from './savedEvents'

const events = [
  { event_id: 'a', title: 'Night of Music', venue: 'Quad', department_name: 'Arts', category_name: 'Music', start_at: '2030-04-12T18:00:00Z', status: 'PUBLISHED' },
  { event_id: 'b', title: 'Build a Robot', venue: 'Lab 2', department_name: 'Engineering', category_name: 'Technology', start_at: '2030-05-02T10:00:00Z', status: 'PUBLISHED' },
]
describe('MEHFIL event relationships and discovery', () => {
  it('groups registrations by the event foreign key and drops orphaned event ids', () => {
    const grouped = groupRegistrationsByEvent(events, [
      { registration_id: 'r1', event_id: 'a', registration_status: 'CONFIRMED' },
      { registration_id: 'r2', event_id: 'a', registration_status: 'CANCELLED' },
      { registration_id: 'r3', event_id: 'missing', registration_status: 'CONFIRMED' },
    ])
    expect(grouped.a.map((row) => row.registration_id)).toEqual(['r1', 'r2'])
    expect(grouped.b).toBeUndefined()
    expect(Object.values(grouped).flat()).toHaveLength(2)
  })

  it('filters by title, category, department, dates, and upcoming status, sorted by event date', () => {
    expect(filterEvents(events, { query: 'quad' }).map((event) => event.event_id)).toEqual(['a'])
    expect(filterEvents(events, { category: 'Technology', department: 'Engineering' }).map((event) => event.event_id)).toEqual(['b'])
    expect(filterEvents(events, { location: 'Lab 2' }).map((event) => event.event_id)).toEqual(['b'])
    expect(filterEvents(events, { from: '2030-04-20', upcoming: false }).map((event) => event.event_id)).toEqual(['b'])
    expect(filterEvents([...events].reverse(), {}, new Date('2030-01-01')).map((event) => event.event_id)).toEqual(['a', 'b'])
  })

  it('only treats published events with open deadlines as available', () => {
    const now = new Date('2030-04-01T00:00:00Z')
    expect(isAvailableEvent({ ...events[0], registration_deadline: '2030-04-10T00:00:00Z' }, now)).toBe(true)
    expect(isAvailableEvent({ ...events[0], status: 'CANCELLED' }, now)).toBe(false)
    expect(isAvailableEvent({ ...events[0], registration_deadline: '2030-03-31T00:00:00Z' }, now)).toBe(false)
  })
})

describe('MEHFIL role permissions', () => {
  it('grants access only to the matching database role', () => {
    expect(canAccessRole({ role: ROLES.ORGANIZER }, [ROLES.ORGANIZER])).toBe(true)
    expect(canAccessRole({ role: ROLES.STUDENT }, [ROLES.ADMIN])).toBe(false)
    expect(canAccessRole(null, [ROLES.STUDENT])).toBe(false)
  })
  it('routes each known role to its own workspace', () => {
    expect(dashboardForRole(ROLES.STUDENT)).toBe('/student')
    expect(dashboardForRole(ROLES.ORGANIZER)).toBe('/organizer')
    expect(dashboardForRole(ROLES.ADMIN)).toBe('/admin')
    expect(dashboardForRole('UNKNOWN')).toBe('/events')
  })
})

describe('saved events', () => {
  function memoryStorage() {
    const values = new Map()
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  }
  it('keeps bookmarks scoped to the authenticated user', () => {
    const storage = memoryStorage()
    expect(toggleSavedEvent('student-1', 'event-a', storage)).toEqual(['event-a'])
    expect(getSavedEvents('student-1', storage)).toEqual(['event-a'])
    expect(getSavedEvents('student-2', storage)).toEqual([])
    expect(toggleSavedEvent('student-1', 'event-a', storage)).toEqual([])
  })
})

