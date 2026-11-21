import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays, CircleCheck, Pencil, Plus, Search, Ticket, Trash2, UserRound, Users } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageTitle, SectionHeading, StatCard, StatusBadge, useToast, Loading } from '../components/ui'
import { adminDeleteEvent, adminDeleteUser, fetchEvents, fetchRegistrations, listUsers, reviewOrganizerRequest, setUserActive, setUserRole } from '../services/api'
import { useRequest, Workspace, EventRows, DataTable } from './WorkspaceShared'
import { formatDate, friendlyError } from '../utils/format'

export function AdminDashboard() {
  const users = useRequest(() => listUsers(), [])
  const events = useRequest(() => fetchEvents(), [])
  const regs = useRequest(() => fetchRegistrations(), [])
  const people = users.data || []; const eventList = events.data || []; const registrations = regs.data || []
  return <Workspace><div className="dashboard-welcome"><div><span className="eyebrow">MEHFIL ADMINISTRATION</span><h1>A clearer view of <em>campus.</em></h1><p>Keep the people and plans moving in the right direction.</p></div><Link className="button button-outline" to="/admin/users">Manage accounts <ArrowUpRight size={17} /></Link></div>
    {(users.error || events.error || regs.error) && <ErrorState message={friendlyError(users.error || events.error || regs.error)} retry={() => { users.refresh(); events.refresh(); regs.refresh() }} />}
    <div className="stats-grid"><StatCard label="Total users" value={users.loading ? '…' : people.length} icon={Users} /><StatCard label="Students" value={people.filter((person) => person.role === 'STUDENT').length} icon={UserRound} tone="stat-lilac" /><StatCard label="Organizers" value={people.filter((person) => person.role === 'ORGANIZER').length} icon={Users} /><StatCard label="Organizer requests" value={people.filter((person) => person.organizer_request_status === 'PENDING').length} icon={Users} tone="stat-coral" /><StatCard label="Events" value={events.loading ? '…' : eventList.length} icon={CalendarDays} /><StatCard label="Published" value={eventList.filter((event) => event.status === 'PUBLISHED').length} icon={CircleCheck} tone="stat-green" /><StatCard label="Registrations" value={regs.loading ? '…' : registrations.length} icon={Ticket} tone="stat-coral" /></div>
    <div className="dashboard-columns"><div className="dashboard-panel"><SectionHeading eyebrow="NEW ON CAMPUS" title="Latest events" action={<Link to="/admin/events" className="text-link">All events <ArrowRight size={15} /></Link>} />{events.loading ? <Loading /> : <EventRows events={eventList.slice(0, 4)} emptyTitle="The calendar is open" emptyText="Published campus events will appear here." />}</div><div className="dashboard-panel"><SectionHeading eyebrow="COMMUNITY" title="Recent members" action={<Link to="/admin/users" className="text-link">All users <ArrowRight size={15} /></Link>} />{users.loading ? <Loading /> : <div className="admin-member-list">{people.slice(0, 5).map((person) => <div key={person.user_id}><span className="member-avatar">{person.full_name?.[0] || 'M'}</span><span><strong>{person.full_name}</strong><small>{person.email}</small></span><StatusBadge value={person.role} /></div>)}</div>}</div></div>
  </Workspace>
}

export function AdminUsersPage() {
  const data = useRequest(() => listUsers(), [])
  const { user } = useAuth()
  const notify = useToast()
  const [query, setQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [roleChangeTarget, setRoleChangeTarget] = useState(null)
  const [roleChangeBusy, setRoleChangeBusy] = useState(false)
  const [requestReviewTarget, setRequestReviewTarget] = useState(null)
  const [requestReviewBusy, setRequestReviewBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const rows = (data.data || []).filter((person) => [person.full_name, person.email, person.student_number, person.organization_name, person.department_name, person.role].filter(Boolean).some((value) => value.toLowerCase().includes(query.toLowerCase())))
  const changeRole = (person, role) => {
    if (role !== person.role) setRoleChangeTarget({ person, role })
  }
  const applyRoleChange = async () => {
    if (!roleChangeTarget) return
    setRoleChangeBusy(true)
    try {
      await setUserRole(roleChangeTarget.person.user_id, roleChangeTarget.role)
      setRoleChangeTarget(null)
      await data.refresh()
      notify('Role updated through the authorized admin function.')
    } catch (error) { notify(friendlyError(error), 'error') } finally { setRoleChangeBusy(false) }
  }
  const applyOrganizerRequestReview = async () => {
    if (!requestReviewTarget) return
    setRequestReviewBusy(true)
    try {
      await reviewOrganizerRequest(requestReviewTarget.person.user_id, requestReviewTarget.approved)
      setRequestReviewTarget(null)
      await data.refresh()
      notify(requestReviewTarget.approved ? 'Organizer access approved.' : 'Organizer request declined.')
    } catch (error) { notify(friendlyError(error), 'error') } finally { setRequestReviewBusy(false) }
  }
  const toggle = async (person) => {
    try { await setUserActive(person.user_id, !person.is_active); await data.refresh(); notify(person.is_active ? 'Account deactivated.' : 'Account activated.') }
    catch (error) { notify(friendlyError(error), 'error') }
  }
  const removeUser = async () => {
    if (!deleteTarget || deleteTarget.user_id === user?.id) return
    setDeletingUser(true)
    try {
      await adminDeleteUser(deleteTarget.user_id)
      if (selectedUser?.user_id === deleteTarget.user_id) setSelectedUser(null)
      setDeleteTarget(null)
      await data.refresh()
      notify('Account deleted.')
    } catch (error) { notify(friendlyError(error), 'error') } finally { setDeletingUser(false) }
  }
  return <Workspace><PageTitle eyebrow="MEHFIL ADMINISTRATION" title="People & access" description="Review organizer requests, manage campus access, and remove accounts when needed." />
    <div className="table-toolbar"><div className="search-control"><Search size={16} /><input placeholder="Search people, email, roll number" value={query} onChange={(e) => setQuery(e.target.value)} /></div><span className="table-count">{rows.length} accounts</span></div>
    {data.loading ? <Loading /> : data.error ? <ErrorState message={friendlyError(data.error)} retry={data.refresh} /> : rows.length ? <DataTable columns={['Name / email', 'Role', 'Roll Number', 'Organization', 'Department', 'Account status', 'Organizer request', 'Joined', 'Actions']} rows={rows.map((person) => [<span className="person-cell"><strong>{person.full_name}</strong><small>{person.email}</small></span>, <select className="inline-select" value={person.role} disabled={person.organizer_request_status === 'PENDING'} onChange={(e) => changeRole(person, e.target.value)}>{['STUDENT', 'ORGANIZER', 'ADMIN'].map((role) => <option key={role}>{role}</option>)}</select>, person.student_number || '—', person.organization_name || '—', person.department_name || '—', <StatusBadge value={person.is_active ? 'ACTIVE' : 'INACTIVE'} />, person.organizer_request_status === 'PENDING' ? <span>{person.is_active ? 'Awaiting review' : 'Email confirmation required'}</span> : person.organizer_request_status || '—', formatDate(person.created_at), <div className="row-buttons">{person.organizer_request_status === 'PENDING' && <><Button variant="outline" className="button-small" disabled={!person.is_active} onClick={() => setRequestReviewTarget({ person, approved: true })}>Approve</Button><Button variant="quiet" className="button-small" onClick={() => setRequestReviewTarget({ person, approved: false })}>Decline</Button></>}<Button variant="quiet" className="button-small" onClick={() => setSelectedUser(person)}>Details</Button><Button variant="outline" className="button-small" disabled={person.user_id === user?.id} onClick={() => toggle(person)}>{person.is_active ? 'Deactivate' : 'Activate'}</Button><Button variant="danger" className="button-small" disabled={person.user_id === user?.id} onClick={() => setDeleteTarget(person)}><Trash2 size={13} /> Delete</Button></div>])} /> : <EmptyState icon={Users} title="No matching accounts" description="Try a different name or search term." />}
    {roleChangeTarget && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !roleChangeBusy) setRoleChangeTarget(null) }} onKeyDown={(event) => { if (event.key === 'Escape' && !roleChangeBusy) setRoleChangeTarget(null) }}><div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="role-change-title" aria-describedby="role-change-description" onClick={(event) => event.stopPropagation()}><span className="eyebrow">ACCESS CHANGE</span><h2 id="role-change-title">Change account role?</h2><p id="role-change-description">Change {roleChangeTarget.person.full_name || 'this member'} from {roleChangeTarget.person.role} to {roleChangeTarget.role}? Access changes take effect immediately.</p><div className="dialog-actions"><Button type="button" variant="quiet" autoFocus disabled={roleChangeBusy} onClick={() => setRoleChangeTarget(null)}>Cancel</Button><Button type="button" disabled={roleChangeBusy} onClick={applyRoleChange}>{roleChangeBusy ? 'Updating role...' : 'Confirm change'}</Button></div></div></div>}
    {requestReviewTarget && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !requestReviewBusy) setRequestReviewTarget(null) }} onKeyDown={(event) => { if (event.key === 'Escape' && !requestReviewBusy) setRequestReviewTarget(null) }}><div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="organizer-review-title" aria-describedby="organizer-review-description" onClick={(event) => event.stopPropagation()}><span className="eyebrow">ORGANIZER ACCESS</span><h2 id="organizer-review-title">{requestReviewTarget.approved ? 'Approve this request?' : 'Decline this request?'}</h2><p id="organizer-review-description">{requestReviewTarget.person.full_name || 'This member'} requested organizer access for {requestReviewTarget.person.organization_name || 'their organization'}. {requestReviewTarget.approved ? 'They will receive organizer tools after approval.' : 'Their account will remain a student account.'}</p><div className="dialog-actions"><Button type="button" variant="quiet" autoFocus disabled={requestReviewBusy} onClick={() => setRequestReviewTarget(null)}>Cancel</Button><Button type="button" variant={requestReviewTarget.approved ? 'primary' : 'danger'} disabled={requestReviewBusy || (requestReviewTarget.approved && !requestReviewTarget.person.is_active)} onClick={applyOrganizerRequestReview}>{requestReviewBusy ? 'Saving…' : requestReviewTarget.approved ? 'Approve organizer' : 'Decline request'}</Button></div></div></div>}
    {selectedUser && <div className="dialog-backdrop" onClick={() => setSelectedUser(null)}><div className="dialog-card user-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="user-detail-title" onClick={(event) => event.stopPropagation()}><button className="dialog-close" aria-label="Close details" onClick={() => setSelectedUser(null)}>×</button><span className="eyebrow">ACCOUNT DETAILS</span><h2 id="user-detail-title">{selectedUser.full_name || 'MEHFIL member'}</h2><p>{selectedUser.email}</p><dl><dt>Role</dt><dd><StatusBadge value={selectedUser.role} /></dd><dt>Roll Number</dt><dd>{selectedUser.student_number || '—'}</dd><dt>Organization</dt><dd>{selectedUser.organization_name || '—'}</dd><dt>Department</dt><dd>{selectedUser.department_name || '—'}</dd><dt>Phone</dt><dd>{selectedUser.phone_number || '—'}</dd><dt>Account</dt><dd>{selectedUser.is_active ? 'Active' : 'Inactive'}</dd><dt>Joined</dt><dd>{formatDate(selectedUser.created_at)}</dd></dl><Button variant="outline" onClick={() => setSelectedUser(null)}>Close</Button></div></div>}
    {deleteTarget && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingUser) setDeleteTarget(null) }} onKeyDown={(event) => { if (event.key === 'Escape' && !deletingUser) setDeleteTarget(null) }}><div className="dialog-card delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" onClick={(event) => event.stopPropagation()}><span className="eyebrow">PERMANENT ACTION</span><h2 id="delete-user-title">Delete this account?</h2><strong className="delete-confirm-name">{deleteTarget.full_name || 'MEHFIL member'} · {deleteTarget.email}</strong><p id="delete-user-description">This permanently removes the sign-in and profile. Linked campus records may prevent deletion.</p><div className="dialog-actions"><Button type="button" variant="quiet" autoFocus disabled={deletingUser} onClick={() => setDeleteTarget(null)}>Keep account</Button><Button type="button" variant="danger" disabled={deletingUser} onClick={removeUser}><Trash2 size={15} />{deletingUser ? 'Deleting account…' : 'Delete account'}</Button></div></div></div>}
  </Workspace>
}

export function AdminEventsPage() {
  const data = useRequest(() => fetchEvents(), [])
  const notify = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingEvent, setDeletingEvent] = useState(false)
  const rows = (data.data || []).filter((event) => (!status || event.status === status) && (!query || [event.title, event.venue, event.department_name, event.category_name].filter(Boolean).some((value) => value.toLowerCase().includes(query.toLowerCase()))))
  const removeEvent = async () => {
    if (!deleteTarget) return
    setDeletingEvent(true)
    try {
      await adminDeleteEvent(deleteTarget.event_id)
      setDeleteTarget(null)
      await data.refresh()
      notify('Event and related records deleted.')
    } catch (error) { notify(friendlyError(error), 'error') } finally { setDeletingEvent(false) }
  }
  return <Workspace><PageTitle eyebrow="MEHFIL ADMINISTRATION" title="Event directory" description="Create and manage events across campus." action={<Link to="/admin/events/new" className="button button-primary"><Plus size={16} /> Create event</Link>} />
    <div className="table-toolbar"><div className="search-control"><Search size={16} /><input placeholder="Search title, venue, department" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select className="table-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['PUBLISHED', 'CANCELLED', 'COMPLETED'].map((value) => <option key={value}>{value}</option>)}</select></div>
    {data.loading ? <Loading /> : data.error ? <ErrorState message={friendlyError(data.error)} retry={data.refresh} /> : rows.length ? <DataTable columns={['Event', 'Category', 'Organizer', 'Department', 'Date', 'Venue', 'Status', 'Actions']} rows={rows.map((event) => [<strong>{event.title}</strong>, event.category_name || '-', event.organizer?.organization_name || event.organizer?.full_name || '-', event.department_name || '-', formatDate(event.start_at), event.venue, <StatusBadge value={event.status} />, <div className="row-buttons"><Link to={'/admin/events/' + event.event_id + '/edit'} className="button button-outline button-small"><Pencil size={13} /> Edit</Link><Link to={'/events/' + event.event_id} className="button button-quiet button-small">View <ArrowUpRight size={13} /></Link><Button variant="danger" className="button-small" onClick={() => setDeleteTarget(event)}><Trash2 size={13} /> Delete</Button></div>])} /> : <EmptyState icon={CalendarDays} title="No matching events" description="Try changing the search or status filter." action={<Link to="/admin/events/new" className="button button-primary"><Plus size={16} /> Create event</Link>} />}
    {deleteTarget && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingEvent) setDeleteTarget(null) }} onKeyDown={(event) => { if (event.key === 'Escape' && !deletingEvent) setDeleteTarget(null) }}><div className="dialog-card delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title" aria-describedby="delete-event-description" onClick={(event) => event.stopPropagation()}><span className="eyebrow">PERMANENT ACTION</span><h2 id="delete-event-title">Delete this event?</h2><strong className="delete-confirm-name">{deleteTarget.title}</strong><p id="delete-event-description">This permanently removes the event and its registrations, attendance, and notifications. This action cannot be undone.</p><div className="dialog-actions"><Button type="button" variant="quiet" autoFocus disabled={deletingEvent} onClick={() => setDeleteTarget(null)}>Keep event</Button><Button type="button" variant="danger" disabled={deletingEvent} onClick={removeEvent}><Trash2 size={15} />{deletingEvent ? 'Deleting event…' : 'Delete event'}</Button></div></div></div>}
  </Workspace>
}

export function AdminRegistrationsPage() {
  const registrations = useRequest(() => fetchRegistrations(), [])
  const profiles = useRequest(async () => Object.fromEntries((await listUsers()).map((person) => [person.user_id, person])), [])
  const rows = (registrations.data || []).map((row) => ({ ...row, student: profiles.data?.[row.student_id] }))
  return <Workspace><PageTitle eyebrow="MEHFIL ADMINISTRATION" title="Registrations" description="A campus-wide view of student event participation." />
    {registrations.loading || profiles.loading ? <Loading /> : registrations.error || profiles.error ? <ErrorState message={friendlyError(registrations.error || profiles.error)} retry={() => { registrations.refresh(); profiles.refresh() }} /> : rows.length ? <DataTable columns={['Student', 'Event', 'Registered', 'Status']} rows={rows.map((row) => [<span className="person-cell"><strong>{row.student?.full_name || 'Student'}</strong><small>{row.student?.email || ''}</small></span>, row.event?.title || 'Event unavailable', formatDate(row.registered_at), <StatusBadge value={row.registration_status} />])} /> : <EmptyState icon={Ticket} title="No registrations yet" description="Student registrations will appear here." />}
  </Workspace>
}

export function AdminAttendancePage() {
  const registrations = useRequest(() => fetchRegistrations(), [])
  const users = useRequest(() => listUsers(), [])
  const profiles = Object.fromEntries((users.data || []).map((person) => [person.user_id, person]))
  const attended = (registrations.data || []).filter((row) => row.attendance)
  return <Workspace><PageTitle eyebrow="MEHFIL ADMINISTRATION" title="Attendance overview" description="See check-ins recorded across campus events." />
    {registrations.loading || users.loading ? <Loading /> : registrations.error || users.error ? <ErrorState message={friendlyError(registrations.error || users.error)} retry={() => { registrations.refresh(); users.refresh() }} /> : attended.length ? <DataTable columns={['Student', 'Event', 'Marked', 'Attendance', 'Registration']} rows={attended.map((row) => [profiles[row.student_id]?.full_name || 'Student', row.event?.title || 'Event unavailable', formatDate(row.attendance.marked_at), <StatusBadge value={row.attendance.attendance_status} />, <StatusBadge value={row.registration_status} />])} /> : <EmptyState icon={ClipboardCheck} title="No attendance recorded" description="Organizer check-ins will appear here once events begin." />}
  </Workspace>
}

