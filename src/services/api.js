import { requireSupabase } from '../lib/supabase'

const client = () => requireSupabase()
const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

export async function fetchProfile(userId) {
  if (!userId) return null
  const { data, error } = await client().from('users').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchProfiles(userIds, columns = '*') {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return []
  return unwrap(await client().from('users').select(columns).in('user_id', ids))
}

async function fetchProfilesOptional(userIds) {
  try { return await fetchProfiles(userIds) } catch { return [] }
}

export async function fetchCommunityMemberCount() {
  return unwrap(await client().rpc('public_community_member_count'))
}

export async function fetchEvents({ publicOnly = false, organizerId = null } = {}) {
  let query = client().from('events').select('*').order('start_at', { ascending: true })
  if (publicOnly) query = query.eq('status', 'PUBLISHED')
  if (organizerId) query = query.eq('organizer_id', organizerId)
  const events = unwrap(await query) || []
  const profiles = await fetchProfilesOptional(events.map((event) => event.organizer_id))
  const byId = Object.fromEntries(profiles.map((profile) => [profile.user_id, profile]))
  return events.map((event) => ({ ...event, organizer: byId[event.organizer_id] || null }))
}

export async function fetchEvent(eventId) {
  const event = unwrap(await client().from('events').select('*').eq('event_id', eventId).maybeSingle())
  if (!event) return null
  const [organizer, registrations] = await Promise.all([
    fetchProfile(event.organizer_id).catch(() => null),
    client().from('registrations').select('registration_status').eq('event_id', eventId),
  ])
  const confirmedCount = registrations.error ? null : (registrations.data || []).filter((item) => item.registration_status === 'CONFIRMED').length
  return { ...event, organizer, confirmedCount }
}

export async function fetchRegistrations({ studentId = null, eventIds = null } = {}) {
  let query = client().from('registrations').select('*').order('registered_at', { ascending: false })
  if (studentId) query = query.eq('student_id', studentId)
  if (eventIds) {
    if (!eventIds.length) return []
    query = query.in('event_id', eventIds)
  }
  const registrations = unwrap(await query) || []
  if (!registrations.length) return []
  const ids = [...new Set(registrations.map((item) => item.event_id))]
  const attendanceIds = registrations.map((item) => item.registration_id)
  const [eventsResult, attendanceResult] = await Promise.all([
    client().from('events').select('*').in('event_id', ids),
    client().from('attendance').select('*').in('registration_id', attendanceIds),
  ])
  if (eventsResult.error) throw eventsResult.error
  if (attendanceResult.error) throw attendanceResult.error
  const events = eventsResult.data || []
  const profiles = await fetchProfilesOptional(events.map((event) => event.organizer_id))
  const organizerMap = Object.fromEntries(profiles.map((profile) => [profile.user_id, profile]))
  const eventMap = Object.fromEntries(events.map((event) => [
    event.event_id, { ...event, organizer: organizerMap[event.organizer_id] || null },
  ]))
  const attendanceMap = Object.fromEntries((attendanceResult.data || []).map((row) => [row.registration_id, row]))
  return registrations.map((item) => ({
    ...item,
    event: eventMap[item.event_id] || null,
    attendance: attendanceMap[item.registration_id] || null,
  }))
}

export async function fetchParticipants(eventIds) {
  const registrations = await fetchRegistrations({ eventIds })
  const profiles = await fetchProfiles(registrations.map((item) => item.student_id), 'user_id,full_name,email,student_number,department_name,organization_name')
  const profileMap = Object.fromEntries(profiles.map((profile) => [profile.user_id, profile]))
  return registrations.map((item) => ({ ...item, student: profileMap[item.student_id] || null }))
}

export async function registerForEvent(eventId) {
  const data = unwrap(await client().rpc('register_for_event', { p_event_id: eventId }))
  const registrationId = typeof data === 'string' ? data : Array.isArray(data) ? data[0]?.registration_id : data?.registration_id
  return { registrationId, data }
}

export async function cancelRegistration(registrationId) {
  return unwrap(await client().rpc('cancel_registration', { p_registration_id: registrationId }))
}

export async function saveEvent(payload) {
  return unwrap(await client().from('events').insert(payload).select('*').single())
}

export async function updateEvent(eventId, payload) {
  return unwrap(await client().from('events').update(payload).eq('event_id', eventId).select('*').single())
}

export async function adminCreateEvent(payload) {
  return unwrap(await client().rpc('admin_create_event', {
    p_title: payload.title,
    p_description: payload.description,
    p_category_name: payload.category_name,
    p_department_name: payload.department_name,
    p_venue: payload.venue,
    p_start_at: payload.start_at,
    p_end_at: payload.end_at,
    p_registration_deadline: payload.registration_deadline,
    p_capacity: payload.capacity,
  }))
}

export async function adminUpdateEvent(eventId, payload) {
  return unwrap(await client().rpc('admin_update_event', {
    p_event_id: eventId,
    p_title: payload.title,
    p_description: payload.description,
    p_category_name: payload.category_name,
    p_department_name: payload.department_name,
    p_venue: payload.venue,
    p_start_at: payload.start_at,
    p_end_at: payload.end_at,
    p_registration_deadline: payload.registration_deadline,
    p_capacity: payload.capacity,
    p_status: payload.status,
  }))
}

export async function adminDeleteEvent(eventId) {
  return unwrap(await client().rpc('admin_delete_event', { p_event_id: eventId }))
}

export async function updateAuthMetadata(payload) {
  const { data, error } = await client().auth.updateUser({ data: payload })
  if (error) throw error
  return data
}

export async function updateProfile(userId, payload) {
  return unwrap(await client().from('users').update(payload).eq('user_id', userId).select('*').single())
}

export async function fetchNotifications(userId) {
  return unwrap(await client().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }))
}

export async function setNotificationRead(notificationId, isRead = true) {
  return unwrap(await client().from('notifications').update({ is_read: isRead }).eq('notification_id', notificationId))
}

export async function setAllNotificationsRead(userId) {
  return unwrap(await client().from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false))
}

export async function markAttendance(registration, attendanceStatus, markedBy) {
  if (registration.registration_status !== 'CONFIRMED') throw new Error('Only confirmed registrations can be checked in.')
  return unwrap(await client().from('attendance').upsert({
    registration_id: registration.registration_id,
    attendance_status: attendanceStatus,
    marked_by: markedBy,
  }, { onConflict: 'registration_id' }).select('*').single())
}

export async function listUsers() {
  return unwrap(await client().from('users').select('*').order('created_at', { ascending: false }))
}

export async function setUserRole(userId, role) {
  return unwrap(await client().rpc('admin_set_user_role', { p_user_id: userId, p_role: role }))
}

export async function setUserActive(userId, isActive) {
  return unwrap(await client().rpc('admin_set_user_active', {
    p_user_id: userId,
    p_is_active: isActive,
  }))
}

export async function adminDeleteUser(userId) {
  const { data, error } = await client().functions.invoke('admin-delete-user', { body: { userId } })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error || message } catch {}
    throw new Error(message || 'The account could not be deleted.')
  }
  return data
}

export async function sendEventEmail(type, eventId, registrationId = null) {
  try {
    const result = await client().functions.invoke('event-email-notify', { body: { type, eventId, registrationId } })
    if (result.error) return result.error
    return null
  } catch (error) {
    return error
  }
}



