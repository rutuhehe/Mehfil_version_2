import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays, CircleCheck, ClipboardCheck, MapPin, Pencil, Plus, Search, Ticket, Users, X } from 'lucide-react'
import { Button, EmptyState, ErrorState, Field, Loading, PageTitle, SectionHeading, StatCard, StatusBadge, useToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { fetchEvents, fetchParticipants, fetchRegistrations, markAttendance, saveEvent, sendEventEmail, updateEvent } from '../services/api'
import { useRequest, Workspace, EventRows, DataTable } from './WorkspaceShared'
import { groupRegistrationsByEvent } from '../utils/events'
import { formatDate, formatTime, friendlyError } from '../utils/format'

function eventToInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function eventPayload(form) {
  return {
    title: form.title.trim(), description: form.description.trim(), category_name: form.category_name.trim(),
    department_name: form.department_name.trim(), venue: form.venue.trim(),
    start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString(),
    registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
    capacity: form.capacity ? Number(form.capacity) : null,
  }
}
const blankEvent = { title: '', description: '', category_name: '', department_name: '', venue: '', start_at: '', end_at: '', registration_deadline: '', capacity: '' }
const EVENT_CATEGORIES = ['Academic', 'Arts', 'Career', 'Community', 'Culture', 'Music', 'Social', 'Sports', 'Technology', 'Wellness', 'Workshop']

export function OrganizerDashboard() {
  const { user } = useAuth()
  const events = useRequest(() => fetchEvents({ organizerId: user.id }), [user?.id])
  const records = events.data || []
  const ids = records.map((item) => item.event_id)
  const registrations = useRequest(() => fetchRegistrations({ eventIds: ids }), [ids.join('|')])
  const grouped = groupRegistrationsByEvent(records, registrations.data || [])
  const totalConfirmed = (registrations.data || []).filter((item) => item.registration_status === 'CONFIRMED').length
  return <Workspace><div className="dashboard-welcome"><div><span className="eyebrow">ORGANIZER STUDIO</span><h1>Your ideas, <em>in motion.</em></h1><p>Make the next good thing happen on campus.</p></div><Link className="button button-primary" to="/organizer/events/new"><Plus size={17} /> Create event</Link></div>{events.error && <ErrorState message={friendlyError(events.error)} retry={events.refresh} />}
    <div className="stats-grid"><StatCard label="Events created" value={records.length} icon={CalendarDays} /><StatCard label="Published" value={records.filter((item) => item.status === 'PUBLISHED').length} icon={CircleCheck} tone="stat-green" /><StatCard label="Cancelled" value={records.filter((item) => item.status === 'CANCELLED').length} icon={X} tone="stat-coral" /><StatCard label="Completed" value={records.filter((item) => item.status === 'COMPLETED').length} icon={CircleCheck} /><StatCard label="Confirmed registrations" value={registrations.loading ? '…' : totalConfirmed} icon={Users} tone="stat-lilac" /></div>
    <div className="dashboard-panel"><SectionHeading eyebrow="YOUR CAMPUS LINEUP" title="Your events" action={<Link to="/organizer/events" className="text-link">Manage events <ArrowRight size={15} /></Link>} />{events.loading ? <Loading /> : <EventRows events={records.slice(0, 5)} emptyTitle="Your first event starts here" emptyText="Bring an idea to campus and invite people in." action={(event) => <span className="row-count">{(grouped[event.event_id] || []).filter((row) => row.registration_status === 'CONFIRMED').length} joined</span>} />}</div>
    <div className="quick-cards"><Link to="/organizer/participants"><Users /><strong>Meet your attendees</strong><span>Search and review registrations.</span></Link><Link to="/organizer/attendance"><ClipboardCheck /><strong>Check people in</strong><span>Verify tickets and mark arrivals.</span></Link></div>
  </Workspace>
}

export function OrganizerEventsPage() {
  const { user } = useAuth()
  const notify = useToast()
  const data = useRequest(() => fetchEvents({ organizerId: user.id }), [user?.id])
  const cancel = async (event) => {
    if (!window.confirm('Cancel “' + event.title + '”? Confirmed attendees will be notified by email if delivery is configured.')) return
    try {
      await updateEvent(event.event_id, { status: 'CANCELLED' })
      const emailError = await sendEventEmail('event_cancelled', event.event_id)
      notify(emailError ? 'Event cancelled. Email delivery is not configured yet.' : 'Event cancelled and attendees notified.')
      await data.refresh()
    } catch (error) { notify(friendlyError(error), 'error') }
  }
  return <Workspace><PageTitle eyebrow="ORGANIZER STUDIO" title="Your events" description="Create, update, and keep your campus calendar moving." action={<Link className="button button-primary" to="/organizer/events/new"><Plus size={17} /> Create event</Link>} />
    {data.loading ? <Loading /> : data.error ? <ErrorState message={friendlyError(data.error)} retry={data.refresh} /> : data.data?.length ? <div className="managed-event-list">{data.data.map((event) => <article className="managed-event" key={event.event_id}><div className="managed-event-copy"><span className="eyebrow">{event.category_name || 'CAMPUS EVENT'}</span><h2>{event.title}</h2><p><CalendarDays size={15} />{formatDate(event.start_at)} · {formatTime(event.start_at)}</p><p><MapPin size={15} />{event.venue}</p></div><StatusBadge value={event.status} /><div className="managed-actions">{event.status !== 'CANCELLED' && <Link to={'/organizer/events/' + event.event_id + '/edit'} className="button button-outline button-small"><Pencil size={14} /> Edit</Link>}<Link to={'/events/' + event.event_id} className="button button-quiet button-small">View</Link>{event.status === 'PUBLISHED' && <Button variant="danger" className="button-small" onClick={() => cancel(event)}>Cancel event</Button>}</div></article>)}</div> : <EmptyState icon={CalendarDays} title="Your calendar begins with an idea" description="Create an event and give students something to look forward to." action={<Link className="button button-primary" to="/organizer/events/new"><Plus size={16} /> Create an event</Link>} />}
  </Workspace>
}

export function OrganizerEventFormPage() {
  const { eventId } = useParams()
  const editMode = Boolean(eventId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const notify = useToast()
  const [form, setForm] = useState(blankEvent)
  const [categoryChoice, setCategoryChoice] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(editMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!editMode) return
    fetchEvents({ organizerId: user.id }).then((events) => {
      const event = events.find((item) => item.event_id === eventId)
      if (!event) throw new Error('This event is unavailable or does not belong to your account.')
      const category = event.category_name || ''
      const isStandardCategory = EVENT_CATEGORIES.includes(category)
      setCategoryChoice(isStandardCategory ? category : category ? 'Other' : '')
      setCustomCategory(isStandardCategory ? '' : category)
      setStatus(event.status)
      setForm({ title: event.title || '', description: event.description || '', category_name: category, department_name: event.department_name || '', venue: event.venue || '', start_at: eventToInput(event.start_at), end_at: eventToInput(event.end_at), registration_deadline: eventToInput(event.registration_deadline), capacity: event.capacity || '' })
    }).catch((problem) => setError(problem.message)).finally(() => setLoading(false))
  }, [eventId, user?.id])
  const update = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }))
  const changeCategory = (event) => {
    const choice = event.target.value
    setCategoryChoice(choice)
    setForm((current) => ({ ...current, category_name: choice === 'Other' ? customCategory : choice }))
  }
  const changeCustomCategory = (event) => {
    const value = event.target.value
    setCustomCategory(value)
    setForm((current) => ({ ...current, category_name: value }))
  }
  const submit = async (event) => {
    event.preventDefault(); setError('')
    const start = new Date(form.start_at); const end = new Date(form.end_at); const deadline = form.registration_deadline ? new Date(form.registration_deadline) : null
    if (!(start < end)) return setError('The end time must be after the start time.')
    if (!editMode && start.getTime() <= Date.now()) return setError('Choose a future start time for a new event.')
    if (!editMode && !deadline) return setError('Add a registration deadline for this event.')
    if (deadline && deadline > start) return setError('The registration deadline must be before the event starts.')
    if (form.capacity && Number(form.capacity) < 1) return setError('Capacity must be at least one.')
    setBusy(true)
    try {
      if (editMode) {
        await updateEvent(eventId, { ...eventPayload(form), status })
        const emailError = await sendEventEmail('event_updated', eventId)
        notify(emailError ? 'Event updated. Email delivery is not configured yet.' : 'Event updated and attendees notified.')
        navigate('/organizer/events')
      } else {
        const created = await saveEvent({ ...eventPayload(form), organizer_id: user.id, status: 'PUBLISHED' })
        notify('Your event is published to the campus calendar.')
        navigate('/organizer/events/' + created.event_id + '/edit')
      }
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }
  if (loading) return <Workspace><Loading /></Workspace>
  return <Workspace><Link className="back-link" to="/organizer/events">← Back to your events</Link><PageTitle eyebrow="ORGANIZER STUDIO" title={editMode ? 'Shape the details' : 'Bring people together'} description={editMode ? 'Keep the information clear and up to date.' : 'Make a little room on the calendar for something good.'} />
    {error && <p className="form-error form-error-box">{error}</p>}
    <form className="form-card event-form" onSubmit={submit}><div className="form-two"><Field label="Event title"><input required maxLength="120" value={form.title} onChange={update('title')} /></Field><Field label="Category"><select required value={categoryChoice} onChange={changeCategory}><option value="">Select a category</option>{EVENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}<option value="Other">Other — enter your own</option></select></Field></div>{categoryChoice === 'Other' && <Field label="Custom category"><input required maxLength="80" placeholder="Enter an event category" value={customCategory} onChange={changeCustomCategory} /></Field>}<Field label="Description"><textarea required rows="5" value={form.description} onChange={update('description')} /></Field><div className="form-two"><Field label="Department"><input required value={form.department_name} onChange={update('department_name')} /></Field><Field label="Venue"><input required value={form.venue} onChange={update('venue')} /></Field></div><div className="form-three"><Field label="Starts"><input required type="datetime-local" value={form.start_at} onChange={update('start_at')} /></Field><Field label="Ends"><input required type="datetime-local" value={form.end_at} onChange={update('end_at')} /></Field><Field label="Registration deadline"><input required={!editMode} type="datetime-local" value={form.registration_deadline} onChange={update('registration_deadline')} /></Field></div><Field label="Capacity"><input min="1" type="number" placeholder="Leave blank for open capacity" value={form.capacity} onChange={update('capacity')} /></Field>{editMode && <div className="form-status-note"><StatusBadge value={status} /> Event status uses the supported campus statuses.</div>}<div className="form-actions"><Button variant="outline" type="button" onClick={() => navigate('/organizer/events')}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : editMode ? 'Save changes' : 'Publish event'} <ArrowUpRight size={16} /></Button></div></form>
  </Workspace>
}

export function OrganizerParticipantsPage() {
  const { user } = useAuth()
  const events = useRequest(() => fetchEvents({ organizerId: user.id }), [user?.id])
  const eventList = events.data || []
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { if (!selected && eventList.length) setSelected(eventList[0].event_id) }, [eventList, selected])
  const participants = useRequest(() => fetchParticipants(selected ? [selected] : []), [selected])
  const rows = (participants.data || []).filter((row) => {
    const student = row.student || {}
    const matches = !query || [student.full_name, student.student_number, student.email, student.department_name].filter(Boolean).some((value) => value.toLowerCase().includes(query.toLowerCase()))
    return matches && (!status || row.registration_status === status)
  })
  return <Workspace><PageTitle eyebrow="YOUR CAMPUS LINEUP" title="Participants" description="The people who are showing up for your events." />
    {events.loading ? <Loading /> : events.error ? <ErrorState message={friendlyError(events.error)} retry={events.refresh} /> : !eventList.length ? <EmptyState icon={Users} title="Participants start with an event" description="Create your first event and confirmed registrations will appear here." action={<Link className="button button-primary" to="/organizer/events/new">Create event <ArrowRight size={15} /></Link>} /> :
      <><div className="table-toolbar"><label className="filter-control"><span>Event</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{eventList.map((event) => <option value={event.event_id} key={event.event_id}>{event.title}</option>)}</select></label><div className="search-control"><Search size={16} /><input placeholder="Search name, roll number, email" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select className="table-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>CONFIRMED</option><option>CANCELLED</option></select></div>
      {participants.loading ? <Loading /> : participants.error ? <ErrorState message={friendlyError(participants.error)} retry={participants.refresh} /> : rows.length ? <DataTable columns={['Student', 'Roll Number', 'Department', 'Email', 'Registered', 'Status']} rows={rows.map((row) => [<strong>{row.student?.full_name || 'Student'}</strong>, row.student?.student_number || '—', row.student?.department_name || '—', row.student?.email || '—', formatDate(row.registered_at), <StatusBadge value={row.registration_status} />])} /> : <EmptyState icon={Users} title="No participants match" description="Try another search, or check back after registrations open." />}</>}
  </Workspace>
}

