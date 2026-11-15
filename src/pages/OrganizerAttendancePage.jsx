import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ClipboardCheck, Search, Ticket, Users } from 'lucide-react'
import { Button, EmptyState, ErrorState, Loading, PageTitle, StatusBadge, useToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { fetchEvents, fetchParticipants, markAttendance } from '../services/api'
import { useRequest, Workspace, DataTable } from './WorkspaceShared'
import { friendlyError } from '../utils/format'

export function OrganizerAttendancePage() {
  const { user } = useAuth()
  const notify = useToast()
  const events = useRequest(() => fetchEvents({ organizerId: user.id }), [user?.id])
  const eventList = events.data || []
  const [selected, setSelected] = useState('')
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState('')
  const participants = useRequest(() => fetchParticipants(selected ? [selected] : []), [selected])
  useEffect(() => { if (!selected && eventList.length) setSelected(eventList[0].event_id) }, [eventList, selected])
  const mark = async (row, attendanceStatus = 'PRESENT') => {
    setBusy(row.registration_id)
    try { await markAttendance(row, attendanceStatus, user.id); notify(attendanceStatus === 'PRESENT' ? 'Attendee checked in.' : 'Attendance marked absent.'); await participants.refresh() }
    catch (error) { notify(friendlyError(error), 'error') } finally { setBusy('') }
  }
  const checkTicket = async (event) => {
    event.preventDefault()
    const registration = (participants.data || []).find((row) => row.registration_id.toLowerCase() === ticket.trim().toLowerCase())
    if (!registration) return notify('Ticket not found for this event.', 'error')
    if (registration.registration_status !== 'CONFIRMED') return notify('This registration is cancelled and cannot be checked in.', 'error')
    await mark(registration, 'PRESENT')
    setTicket('')
  }
  const rows = participants.data || []
  return <Workspace><PageTitle eyebrow="ORGANIZER STUDIO" title="Check-in desk" description="Verify a registration and welcome people as they arrive." />
    {events.loading ? <Loading /> : events.error ? <ErrorState message={friendlyError(events.error)} retry={events.refresh} /> : !eventList.length ? <EmptyState icon={ClipboardCheck} title="Your check-in desk is waiting" description="Create an event and confirmed registrations will be ready to verify." /> :
    <><div className="checkin-toolbar"><label className="filter-control"><span>Event</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{eventList.map((event) => <option value={event.event_id} key={event.event_id}>{event.title}</option>)}</select></label><form className="ticket-lookup" onSubmit={checkTicket}><Ticket size={17} /><input required aria-label="Registration ticket ID" placeholder="Scan or enter registration ID" value={ticket} onChange={(e) => setTicket(e.target.value)} /><Button disabled={busy !== ''}>Verify & check in <ArrowRight size={15} /></Button></form></div>
      <div className="checkin-summary"><span><strong>{rows.filter((row) => row.registration_status === 'CONFIRMED').length}</strong> confirmed</span><span><strong>{rows.filter((row) => row.attendance?.attendance_status === 'PRESENT').length}</strong> checked in</span><span><strong>{rows.filter((row) => row.registration_status === 'CANCELLED').length}</strong> cancelled</span></div>
      {participants.loading ? <Loading /> : participants.error ? <ErrorState message={friendlyError(participants.error)} retry={participants.refresh} /> : rows.length ? <DataTable columns={['Student', 'Roll Number', 'Registration', 'Attendance', 'Actions']} rows={rows.map((row) => [<strong>{row.student?.full_name || 'Student'}</strong>, row.student?.student_number || '—', <StatusBadge value={row.registration_status} />, row.attendance ? <StatusBadge value={row.attendance.attendance_status} /> : <span className="text-muted">Not checked in</span>, row.registration_status === 'CONFIRMED' ? <div className="row-buttons"><Button className="button-small" disabled={busy === row.registration_id} onClick={() => mark(row, 'PRESENT')}><Check size={14} /> Present</Button><Button variant="outline" className="button-small" disabled={busy === row.registration_id} onClick={() => mark(row, 'ABSENT')}>Absent</Button></div> : <span className="text-muted">Unavailable</span>])} /> : <EmptyState icon={Users} title="No registrations to verify" description="Confirmed attendees will appear as they register." />}</>}
  </Workspace>
}
