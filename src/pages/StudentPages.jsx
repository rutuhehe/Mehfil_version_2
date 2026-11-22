import { useEffect, useState } from 'react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ClipboardCheck, Mail, MapPin, Moon, Sparkles, Sun, Ticket, Users, X } from 'lucide-react'
import { Button, EmptyState, ErrorState, EventCard, Field, Loading, PageTitle, SectionHeading, StatCard, StatusBadge, useToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { cancelRegistration, fetchEvents, fetchNotifications, fetchRegistrations, sendEventEmail, setAllNotificationsRead, setNotificationRead, updateAuthMetadata, updateProfile } from '../services/api'
import { useRequest, Workspace, EventRows } from './WorkspaceShared'
import { getSavedEvents } from '../utils/savedEvents'
import { formatDate, formatTime, friendlyError, isAlphabeticText, sanitizeAlphabeticText } from '../utils/format'
import { sanitizePhoneNumber } from '../utils/format'
import { parsePhoneNumber, PhoneNumberType, phoneUtil } from '../utils/phone'

export function StudentDashboard() {
  const { user, profile } = useAuth()
  const registrations = useRequest(() => fetchRegistrations({ studentId: user.id }), [user?.id])
  const notices = useRequest(() => fetchNotifications(user.id), [user?.id])
  const all = registrations.data || []
  const confirmed = all.filter((item) => item.registration_status === 'CONFIRMED')
  const upcoming = confirmed.filter((item) => item.event && new Date(item.event.start_at) > new Date()).map((item) => item.event)
  const attended = all.filter((item) => item.attendance?.attendance_status === 'PRESENT').length
  const cancelled = all.filter((item) => item.registration_status === 'CANCELLED').length
  return <Workspace><div className="dashboard-welcome"><div><span className="eyebrow">YOUR CAMPUS, IN GOOD COMPANY</span><h1>Good to see you, <em>{profile?.full_name?.split(' ')[0] || 'friend'}.</em></h1><p>Make a little room in your week for something new.</p></div><Link className="button button-primary" to="/events">Explore events <ArrowUpRight size={17} /></Link></div>
    {registrations.error && <ErrorState message={friendlyError(registrations.error)} retry={registrations.refresh} />}
    <div className="stats-grid"><StatCard label="Registrations" value={all.length} icon={Ticket} /><StatCard label="Coming up" value={upcoming.length} icon={CalendarDays} tone="stat-lilac" /><StatCard label="Attended" value={attended} icon={Check} tone="stat-green" /><StatCard label="Cancelled" value={cancelled} icon={X} tone="stat-coral" /></div>
    <div className="dashboard-columns"><div className="dashboard-panel"><SectionHeading eyebrow="IN YOUR CALENDAR" title="Coming up" action={<Link className="text-link" to="/student/registrations">All registrations <ArrowRight size={15} /></Link>} />{registrations.loading ? <Loading /> : <EventRows events={upcoming.slice(0, 4)} emptyTitle="A little space for something new" emptyText="Your confirmed upcoming registrations will show up here." action={(event) => <Link to={'/events/' + event.event_id} className="icon-link" aria-label="View event"><ArrowUpRight size={17} /></Link>} />}</div>
      <div className="dashboard-panel activity-panel"><SectionHeading eyebrow="A LITTLE UPDATE" title="Recent activity" />{notices.loading ? <Loading /> : notices.error ? <ErrorState message={friendlyError(notices.error)} retry={notices.refresh} /> : notices.data?.length ? <div className="activity-list">{notices.data.slice(0, 5).map((notice) => <div className="activity-item" key={notice.notification_id}><span className="activity-dot"></span><div><strong>{notice.title}</strong><p>{notice.message}</p><small>{formatDate(notice.created_at)} · {formatTime(notice.created_at)}</small></div></div>)}</div> : <EmptyState icon={Sparkles} title="All caught up" description="Registration updates and event notes will appear here." />}</div></div>
    <section className="dashboard-panel"><SectionHeading eyebrow="A GOOD PLACE TO START" title="Pick up a new thread" action={<Link className="text-link" to="/events">See all events <ArrowRight size={15} /></Link>} /><p className="dashboard-hint">Explore the calendar, bookmark something that catches your eye, and make plans with your people.</p></section>
  </Workspace>
}

export function StudentRegistrationsPage() {
  const { user } = useAuth()
  const notify = useToast()
  const [tab, setTab] = useState('ALL')
  const [busy, setBusy] = useState('')
  const [emailBusy, setEmailBusy] = useState('')
  const data = useRequest(() => fetchRegistrations({ studentId: user.id }), [user?.id])
  const rows = data.data || []
  const filtered = rows.filter((item) => tab === 'CONFIRMED' || tab === 'CANCELLED' ? item.registration_status === tab : tab === 'PAST' ? item.event && new Date(item.event.end_at || item.event.start_at) < new Date() : true)
  const cancel = async (row) => {
    if (!window.confirm('Cancel your registration for ' + (row.event?.title || 'this event') + '?')) return
    setBusy(row.registration_id)
    try { await cancelRegistration(row.registration_id); await sendEventEmail('registration_cancelled', row.event_id, row.registration_id); notify('Your registration has been cancelled.'); await data.refresh() }
    catch (error) { notify(friendlyError(error), 'error') } finally { setBusy('') }
  }
  const resendConfirmation = async (row) => {
    setEmailBusy(row.registration_id)
    try {
      const emailError = await sendEventEmail('registration_confirmed', row.event_id, row.registration_id, { resend: true })
      notify(emailError ? 'Could not send confirmation email: ' + (emailError.message || 'delivery unavailable') : 'Confirmation email sent to your account email.')
    } catch (error) { notify(friendlyError(error), 'error') } finally { setEmailBusy('') }
  }
  return <Workspace><PageTitle eyebrow="YOUR CAMPUS PLANS" title="My registrations" description="The moments you’ve already made room for." /><div className="tabs">{['ALL', 'CONFIRMED', 'CANCELLED', 'PAST'].map((item) => <button key={item} className={tab === item ? 'tab-active' : ''} onClick={() => setTab(item)}>{item[0] + item.slice(1).toLowerCase()}</button>)}</div>
    {data.loading ? <Loading /> : data.error ? <ErrorState message={friendlyError(data.error)} retry={data.refresh} /> : filtered.length ? <div className="registration-list">{filtered.map((row) => <article className="registration-card" key={row.registration_id}><div className="registration-date"><span>{new Date(row.event?.start_at || row.registered_at).toLocaleDateString(undefined, { month: 'short' })}</span><strong>{new Date(row.event?.start_at || row.registered_at).getDate()}</strong><small>{new Date(row.event?.start_at || row.registered_at).getFullYear()}</small></div><div className="registration-info"><span className="eyebrow">{row.event?.category_name || 'CAMPUS EVENT'}</span><h3>{row.event?.title || 'Event details unavailable'}</h3><p><CalendarDays size={14} />{formatDate(row.event?.start_at)} · Registered {formatDate(row.registered_at)}</p><p><MapPin size={14} />{row.event?.venue || 'Venue to be announced'}</p><p className="registration-ticket"><span>REGISTRATION ID</span><code>{row.registration_id}</code>{row.registration_status === 'CONFIRMED' && <small>Show this ID to the organizer at check-in.</small>}</p></div><div className="registration-status"><StatusBadge value={row.registration_status} />{row.attendance && <StatusBadge value={row.attendance.attendance_status} />}<span>Attendance: {row.attendance?.attendance_status || 'Not yet marked'}</span></div><div className="registration-actions">{row.event && <Link className="button button-outline button-small" to={'/events/' + row.event_id}>Details</Link>}{row.registration_status === 'CONFIRMED' && <><Button variant="outline" className="button-small" disabled={emailBusy === row.registration_id} onClick={() => resendConfirmation(row)}><Mail size={14} />{emailBusy === row.registration_id ? 'Sending…' : 'Resend email'}</Button><Button variant="quiet" disabled={busy === row.registration_id} onClick={() => cancel(row)}>{busy === row.registration_id ? 'Cancelling…' : 'Cancel'}</Button></>}</div></article>)}</div> : <EmptyState icon={Ticket} title="No registrations in this view" description="When you find something worth showing up for, your registration will appear here." action={<Link className="button button-primary" to="/events">Explore events <ArrowRight size={16} /></Link>} />}
  </Workspace>
}

export function SavedEventsPage() {
  const { user } = useAuth()
  const [saved, setSaved] = useState(() => getSavedEvents(user.id))
  const events = useRequest(() => fetchEvents({ publicOnly: true }), [])
  const savedEvents = (events.data || []).filter((event) => saved.includes(event.event_id))
  return <Workspace><PageTitle eyebrow="KEPT CLOSE" title="Saved events" description="Your own little shortlist, kept on this device." />
    {events.loading ? <Loading /> : events.error ? <ErrorState message={friendlyError(events.error)} retry={events.refresh} /> : savedEvents.length ? <div className="event-grid">{savedEvents.map((event) => <EventCard key={event.event_id} event={event} userId={user.id} onSave={() => setSaved(getSavedEvents(user.id))} />)}</div> : <EmptyState icon={Ticket} title="Keep a few ideas close" description="Tap the bookmark on an event card and it will be waiting for you here." action={<Link className="button button-primary" to="/events">Explore events <ArrowRight size={16} /></Link>} />}
  </Workspace>
}

export function ProfilePage() {
  const { user, profile, refreshProfile, signOut, deleteAccount } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const metadata = user?.user_metadata || {}
  const organizerAccount = profile?.role === 'ORGANIZER' || metadata.register_as === 'ORGANIZER'
  const [form, setForm] = useState({})
  const [savedForm, setSavedForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const notify = useToast()

  const initialForm = useMemo(() => ({
    full_name: profile?.full_name || '',
    department_name: profile?.department_name || '',
    phone_number: profile?.phone_number || '',
    organization_name: profile?.organization_name || metadata.organization_name || '',
    college_name: metadata.college_name || '',
    year_of_study: metadata.year_of_study || '',
    organization_type: metadata.organization_type || '',
    designation: metadata.designation || '',
  }), [profile, user, organizerAccount])
  const editableFields = organizerAccount
    ? ['full_name', 'phone_number', 'organization_name', 'organization_type', 'designation']
    : ['full_name', 'phone_number', 'department_name', 'college_name', 'year_of_study']
  const requiredFields = organizerAccount
    ? [['full_name', 'Full name'], ['organization_name', 'Organization Name'], ['organization_type', 'Organization Type'], ['designation', 'Designation']]
    : [['full_name', 'Full name'], ['department_name', 'Department'], ['college_name', 'College'], ['year_of_study', 'Year of Study']]
  const missingRequiredField = requiredFields.find(([key]) => !(form[key] || '').trim())
  const requiredError = missingRequiredField ? missingRequiredField[1] + ' is required.' : ''
  const alphabeticFields = organizerAccount
    ? [['full_name', 'Full name'], ['organization_name', 'Organization Name'], ['organization_type', 'Organization Type'], ['designation', 'Designation']]
    : [['full_name', 'Full name'], ['department_name', 'Department'], ['college_name', 'College']]
  const invalidAlphabeticField = alphabeticFields.find(([key]) => !isAlphabeticText(form[key] || ''))
  const alphabeticError = invalidAlphabeticField
    ? invalidAlphabeticField[1] + ' can contain letters and spaces only.'
    : ''
  const parsedPhone = form.phone_number ? parsePhoneNumber(form.phone_number) : null
  const phoneType = parsedPhone ? phoneUtil.getNumberType(parsedPhone) : null
  const phoneError = !(form.phone_number || '').trim()
    ? 'Phone number is required.'
    : !parsedPhone || !phoneUtil.isValidNumber(parsedPhone)
      ? 'Enter a valid phone number with its country code, such as +91 7045311328.'
      : ![PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE].includes(phoneType)
        ? 'Enter a mobile number. Landline and service numbers are not accepted.'
        : ''
  const hasChanges = editableFields.some((key) => (form[key] ?? '') !== (savedForm[key] ?? ''))

  useEffect(() => {
    setForm(initialForm)
    setSavedForm(initialForm)
  }, [initialForm])

  const updateProfileField = (name, lettersOnly = false) => (event) => {
    const value = name === 'phone_number'
      ? sanitizePhoneNumber(event.target.value)
      : lettersOnly ? sanitizeAlphabeticText(event.target.value) : event.target.value
    setError('')
    setForm((current) => ({ ...current, [name]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!hasChanges || busy) return
    if (requiredError) {
      setError(requiredError)
      return
    }
    if (invalidAlphabeticField) {
      setError(alphabeticError)
      return
    }
    if (phoneError) {
      setError(phoneError)
      return
    }
    setBusy(true); setError(''); setMessage('')
    const editable = {
      full_name: (form.full_name || '').trim(),
      phone_number: (form.phone_number || '').trim(),
    }
    if (profile?.role === 'ORGANIZER') editable.organization_name = (form.organization_name || '').trim()
    else editable.department_name = (form.department_name || '').trim()
    const metadataUpdate = organizerAccount
      ? { organization_name: (form.organization_name || '').trim(), organization_type: form.organization_type || '', designation: (form.designation || '').trim() }
      : { college_name: (form.college_name || '').trim(), year_of_study: form.year_of_study || '' }
    try {
      await updateProfile(user.id, editable)
      await updateAuthMetadata(metadataUpdate)
      await refreshProfile()
      const updatedForm = { ...form, ...editable, ...metadataUpdate }
      setForm(updatedForm)
      setSavedForm(updatedForm)
      setMessage('Your profile has been updated.')
      notify('Profile saved.')
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }

  const logout = async () => {
    try { await signOut(); navigate('/'); notify('You are logged out.') }
    catch (problem) { notify(friendlyError(problem), 'error') }
  }
  const removeAccount = async (event) => {
    event.preventDefault()
    if (deleteText !== 'DELETE') return
    setDeleting(true); setDeleteError('')
    try {
      await deleteAccount()
      setDeleteOpen(false)
      navigate('/', { replace: true })
    } catch (problem) { setDeleteError(friendlyError(problem)) } finally { setDeleting(false) }
  }

  return <Workspace><PageTitle eyebrow="YOUR ACCOUNT" title="Your profile" description="Keep your campus details up to date." />
    {organizerAccount && profile?.role !== 'ORGANIZER' && <div className="notice-box profile-notice">{profile?.organizer_request_status === 'REJECTED'
      ? 'Your organizer access request was not approved. Your account remains a student account. Contact a campus administrator if you need more information.'
      : 'Your organizer request is awaiting review by a campus administrator. Your account remains a student account until it is approved, so organizer tools are not available yet.'}</div>}
    <div className="profile-layout"><aside className="profile-card"><div className="profile-avatar">{(profile?.full_name || 'M').slice(0, 1).toUpperCase()}</div><h2>{profile?.full_name || 'MEHFIL member'}</h2><p>{profile?.email}</p><StatusBadge value={profile?.role} /><dl><dt>Account status</dt><dd>{profile?.is_active ? 'Active' : 'Inactive'}</dd><dt>Member since</dt><dd>{formatDate(profile?.created_at)}</dd></dl></aside>
      <div className="profile-main-column">
        <form className="form-card" onSubmit={submit}><h2>Personal details</h2><p>Your role and account access are controlled by the database.</p>
          <Field label="Full name"><input required autoComplete="name" placeholder="Your full name" value={form.full_name || ''} onChange={updateProfileField('full_name', true)} /></Field>
          <div className="form-two"><Field label="Email address"><input value={profile?.email || ''} disabled /></Field><Field label="Phone number"><input type="tel" required inputMode="tel" autoComplete="tel" placeholder="+91 7045311328" value={form.phone_number || ''} onChange={updateProfileField('phone_number')} /></Field></div>
          <Field label="Role"><input value={profile?.role || ''} disabled /></Field>
          {organizerAccount ? <>
            <span className="form-section-tag">Organiser details</span>
            <Field label="Organization Name"><input required value={form.organization_name || ''} onChange={updateProfileField('organization_name', true)} /></Field>
            <Field label="Organization Type"><input required placeholder="College Club, Student Council, Department, External Organization" value={form.organization_type || ''} onChange={updateProfileField('organization_type', true)} /></Field>
            <Field label="Designation"><input required placeholder="President, Secretary, Coordinator, Faculty, etc." value={form.designation || ''} onChange={updateProfileField('designation', true)} /></Field>
          </> : <>
            <span className="form-section-tag">Student details</span>
            <div className="form-two"><Field label="Roll Number"><input value={profile?.student_number || ''} disabled /></Field><Field label="Department"><input required value={form.department_name || ''} onChange={updateProfileField('department_name', true)} /></Field></div>
            <div className="form-two"><Field label="College"><input required placeholder="Institution name" value={form.college_name || ''} onChange={updateProfileField('college_name', true)} /></Field><Field label="Year of Study"><input required placeholder="First, Second, Third, Fourth year" value={form.year_of_study || ''} onChange={updateProfileField('year_of_study')} /></Field></div>
          </>}
          {(error || requiredError || alphabeticError || phoneError) && <p className="form-error" role="alert">{error || requiredError || alphabeticError || phoneError}</p>}{message && <p className="form-success" role="status">{message}</p>}
          <Button disabled={busy || !hasChanges || Boolean(requiredError) || Boolean(invalidAlphabeticField) || Boolean(phoneError)}>{busy ? 'Saving…' : 'Save changes'} <Check size={16} /></Button>
        </form>
        <section className="form-card account-actions-card"><div><span className="eyebrow">PREFERENCES</span><h2>Appearance</h2><p>Choose the look that feels right for you.</p></div><div className="theme-preference"><span>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span><Button variant="outline" onClick={toggleTheme}>Switch to {theme === 'dark' ? 'light' : 'dark'} {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</Button></div>
          <div className="account-action-row"><div><strong>Log out</strong><span>Sign out of MEHFIL on this device.</span></div><Button variant="outline" onClick={logout}>Log out</Button></div>
          <div className="account-action-row account-action-danger"><div><strong>Delete account</strong><span>Permanently remove this sign-in. Linked campus records may require administrator help.</span></div><Button variant="danger" onClick={() => { setDeleteText(''); setDeleteError(''); setDeleteOpen(true) }}>Delete account</Button></div>
        </section>
      </div>
    </div>
    {deleteOpen && <div className="dialog-backdrop"><form className="dialog-card delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onSubmit={removeAccount}><span className="eyebrow">PERMANENT ACTION</span><h2 id="delete-account-title">Delete your account?</h2><p>This removes your MEHFIL sign-in. Type <strong>DELETE</strong> to confirm. If existing campus records prevent deletion, they will remain and you can contact an administrator.</p><Field label="Type DELETE to confirm"><input autoComplete="off" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></Field>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="dialog-actions"><Button type="button" variant="quiet" onClick={() => setDeleteOpen(false)}>Keep account</Button><Button type="submit" variant="danger" disabled={deleteText !== 'DELETE' || deleting}>{deleting ? 'Deleting…' : 'Delete permanently'}</Button></div></form></div>}
  </Workspace>
}
export function NotificationsPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const notify = useToast()
  const data = useRequest(() => fetchNotifications(user.id), [user?.id])
  const markOne = async (item) => {
    try {
      await setNotificationRead(item.notification_id, !item.is_read)
      await data.refresh()
      if (profile?.role === 'ADMIN' && item.notification_type === 'organizer_request') navigate('/admin/users')
    } catch (error) { notify(friendlyError(error), 'error') }
  }
  const markAll = async () => { try { await setAllNotificationsRead(user.id); await data.refresh(); notify('All notifications marked as read.') } catch (error) { notify(friendlyError(error), 'error') } }
  return <Workspace><PageTitle eyebrow="A NOTE FROM CAMPUS" title="Notifications" description={profile?.role === 'ADMIN' ? 'Event updates, registration notes, and access requests that need review.' : 'Event updates and registration notes, all in one place.'} action={data.data?.some((item) => !item.is_read) && <Button variant="outline" onClick={markAll}>Mark all read <Check size={15} /></Button>} />
    {data.loading ? <Loading /> : data.error ? <ErrorState message={friendlyError(data.error)} retry={data.refresh} /> : data.data?.length ? <div className="notification-list">{data.data.map((item) => <button className={'notification-row' + (!item.is_read ? ' notification-unread' : '')} key={item.notification_id} onClick={() => markOne(item)}><span className="notification-icon"><CalendarDays size={18} /></span><span className="notification-content"><strong>{item.title}</strong><p>{item.message}</p><small>{formatDate(item.created_at)} · {formatTime(item.created_at)} · {item.notification_type}</small></span>{!item.is_read && <span className="unread-dot"></span>}</button>)}</div> : <EmptyState icon={Check} title="All caught up" description="You’ll find registration confirmations and event updates here." />}
  </Workspace>
}



