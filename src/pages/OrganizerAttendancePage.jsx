import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ClipboardCheck, Ticket, Upload, Users } from 'lucide-react'
import { Button, EmptyState, ErrorState, Loading, PageTitle, StatusBadge, useToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { fetchEvents, fetchParticipants, markAttendance } from '../services/api'
import { useRequest, Workspace, DataTable } from './WorkspaceShared'
import { friendlyError } from '../utils/format'

function parseOfflineCheckIns(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('The check-in CSV is empty.')
  const header = lines[0].split(',').map((column) => column.trim().toLowerCase())
  const indexes = Object.fromEntries(header.map((column, index) => [column, index]))
  const required = ['registration_id', 'event_id', 'attendance_status']
  const missing = required.filter((column) => indexes[column] === undefined)
  if (missing.length) throw new Error('This is not a Java validator check-in CSV. Required columns: registration_id,event_id,attendance_status.')

  return lines.slice(1).map((line, index) => {
    const cells = line.split(',')
    const maxIndex = Math.max(...required.map((column) => indexes[column]))
    if (cells.length <= maxIndex) throw new Error('Check-in CSV row ' + (index + 2) + ' is incomplete.')
    return {
      registrationId: cells[indexes.registration_id].trim().toLowerCase(),
      eventId: cells[indexes.event_id].trim().toLowerCase(),
      attendanceStatus: cells[indexes.attendance_status].trim().toUpperCase(),
    }
  })
}

export function OrganizerAttendancePage() {
  const { user } = useAuth()
  const notify = useToast()
  const events = useRequest(() => fetchEvents({ organizerId: user.id }), [user?.id])
  const eventList = events.data || []
  const [selected, setSelected] = useState('')
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState('')
  const [importing, setImporting] = useState(false)
  const importFile = useRef(null)
  const participants = useRequest(() => fetchParticipants(selected ? [selected] : []), [selected])
  useEffect(() => { if (!selected && eventList.length) setSelected(eventList[0].event_id) }, [eventList, selected])

  const mark = async (row, attendanceStatus = 'PRESENT') => {
    setBusy(row.registration_id)
    try {
      await markAttendance(row, attendanceStatus, user.id)
      notify(attendanceStatus === 'PRESENT' ? 'Attendee checked in.' : 'Attendance marked absent.')
      await participants.refresh()
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setBusy('')
    }
  }

  const checkTicket = async (event) => {
    event.preventDefault()
    const registration = (participants.data || []).find((row) => row.registration_id.toLowerCase() === ticket.trim().toLowerCase())
    if (!registration) return notify('Ticket not found for this event.', 'error')
    if (registration.registration_status !== 'CONFIRMED') return notify('This registration is cancelled and cannot be checked in.', 'error')
    await mark(registration, 'PRESENT')
    setTicket('')
  }

  const importOfflineCheckIns = async (event) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const importedRows = parseOfflineCheckIns(await file.text())
      const roster = new Map((participants.data || []).map((row) => [row.registration_id.toLowerCase(), row]))
      const seen = new Set()
      let imported = 0
      let skipped = 0

      for (const checkIn of importedRows) {
        if (seen.has(checkIn.registrationId)) {
          skipped++
          continue
        }
        seen.add(checkIn.registrationId)
        const registration = roster.get(checkIn.registrationId)
        if (checkIn.eventId !== selected.toLowerCase()
          || checkIn.attendanceStatus !== 'PRESENT'
          || !registration
          || registration.registration_status !== 'CONFIRMED'
          || registration.attendance?.attendance_status === 'PRESENT') {
          skipped++
          continue
        }
        await markAttendance(registration, 'PRESENT', user.id)
        imported++
      }

      await participants.refresh()
      notify(imported
        ? 'Imported ' + imported + ' offline check-in' + (imported === 1 ? '' : 's') + (skipped ? '; skipped ' + skipped + '.' : '.')
        : 'No new check-ins imported' + (skipped ? '; skipped ' + skipped + ' invalid, duplicate, or already checked-in rows.' : '.'), imported ? 'success' : 'error')
    } catch (error) {
      notify(friendlyError(error), 'error')
    } finally {
      setImporting(false)
      input.value = ''
    }
  }

  const rows = participants.data || []
  return <Workspace><PageTitle eyebrow="ORGANIZER STUDIO" title="Check-in desk" description="Verify a registration and welcome people as they arrive." />
    {events.loading ? <Loading /> : events.error ? <ErrorState message={friendlyError(events.error)} retry={events.refresh} /> : !eventList.length ? <EmptyState icon={ClipboardCheck} title="Your check-in desk is waiting" description="Create an event and confirmed registrations will be ready to verify." /> :
      <><div className="checkin-toolbar">
        <label className="filter-control"><span>Event</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{eventList.map((event) => <option value={event.event_id} key={event.event_id}>{event.title}</option>)}</select></label>
        <form className="ticket-lookup" onSubmit={checkTicket}><Ticket size={17} /><input required aria-label="Registration ticket ID" placeholder="Scan or enter registration ID" value={ticket} onChange={(event) => setTicket(event.target.value)} /><Button disabled={busy !== ''}>Verify & check in <ArrowRight size={15} /></Button></form>
      </div>
      <div className="offline-checkin-tools"><div><strong>Offline check-in</strong><span>Import the checked-in.csv file created by the Java validator for this event.</span></div><Button variant="outline" disabled={importing || participants.loading || !selected} onClick={() => importFile.current?.click()}><Upload size={15} />{importing ? 'Importing…' : 'Import offline check-ins'}</Button><input ref={importFile} type="file" accept=".csv,text/csv" hidden onChange={importOfflineCheckIns} /></div>
      <div className="checkin-summary"><span><strong>{rows.filter((row) => row.registration_status === 'CONFIRMED').length}</strong> confirmed</span><span><strong>{rows.filter((row) => row.attendance?.attendance_status === 'PRESENT').length}</strong> checked in</span><span><strong>{rows.filter((row) => row.registration_status === 'CANCELLED').length}</strong> cancelled</span></div>
      {participants.loading ? <Loading /> : participants.error ? <ErrorState message={friendlyError(participants.error)} retry={participants.refresh} /> : rows.length ? <DataTable columns={['Student', 'Roll Number', 'Registration ID', 'Status', 'Attendance', 'Actions']} rows={rows.map((row) => [<strong>{row.student?.full_name || 'Student'}</strong>, row.student?.student_number || '—', <code className="registration-id">{row.registration_id}</code>, <StatusBadge value={row.registration_status} />, row.attendance ? <StatusBadge value={row.attendance.attendance_status} /> : <span className="text-muted">Not checked in</span>, row.registration_status === 'CONFIRMED' ? <div className="row-buttons"><Button className="button-small" disabled={busy === row.registration_id} onClick={() => mark(row, 'PRESENT')}><Check size={14} /> Present</Button><Button variant="outline" className="button-small" disabled={busy === row.registration_id} onClick={() => mark(row, 'ABSENT')}>Absent</Button></div> : <span className="text-muted">Unavailable</span>])} /> : <EmptyState icon={Users} title="No registrations to verify" description="Confirmed attendees will appear as they register." />}</>}
  </Workspace>
}
