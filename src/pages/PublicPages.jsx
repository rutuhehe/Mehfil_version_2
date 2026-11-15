import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown,
  Coffee, Compass, HeartHandshake, Mail, Moon, Search, ShieldCheck, Sparkles, Sun, Ticket, Trophy, Users,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Button, EmptyState, ErrorState, EventCard, Field, Footer, Loading, PageFrame, SectionHeading, StatusBadge, useToast } from '../components/ui'
import { cancelRegistration, fetchEvent, fetchEvents, fetchRegistrations, registerForEvent, sendEventEmail } from '../services/api'
import { dashboardForRole, filterEvents, isAvailableEvent } from '../utils/events'
import { supabase } from '../lib/supabase'
import { formatDate, formatTime, friendlyError } from '../utils/format'
import mehfilLogo from '../assets/mehfil-logo.jpeg'

export function HomePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchEvents({ publicOnly: true }).then((data) => setEvents(data.filter((event) => new Date(event.start_at) > new Date()).slice(0, 3)))
      .catch((problem) => setError(problem.message)).finally(() => setLoading(false))
  }, [])
  const { user } = useAuth()
  return <PageFrame>
    <section className="hero"><div className="hero-inner">
      <div className="hero-copy"><div className="hero-eyebrow"><span></span> YOUR CAMPUS, IN GOOD COMPANY</div>
        <h1>Your campus.<br /><em>Your people.</em><br />Your moments.</h1>
        <p>The little moments become the big memories. Find the gatherings, ideas, and people that make campus feel like yours.</p>
        <div className="hero-actions"><Link className="button button-primary button-large" to="/events">Explore events <ArrowUpRight size={18} /></Link>{!user && <Link className="button button-outline button-large" to="/register">Join MEHFIL <ArrowRight size={17} /></Link>}</div>
        <div className="hero-note"><div className="avatar-stack"><i>M</i><i>+</i><i>Y</i></div><span>Made by campus, for campus</span></div>
      </div>
      <div className="hero-visual" role="img" aria-label="Students gathering outdoors at a campus cultural event">
        <div className="hero-photo"></div><div className="hero-photo-wash"></div>
        <div className="hero-stamp"><span>MEHFIL</span><small>Where campus<br />comes together</small><ArrowDownRight size={19} /></div>
        <div className="hero-caption"><Sparkles size={14} /> FIND YOUR PEOPLE HERE</div>
      </div>
      <div className="hero-side-note">A LITTLE MORE TOGETHER <span>✳</span></div>
    </div><div className="hero-bottom"><span>DISCOVER WHAT'S HAPPENING</span><span>01 — THE CAMPUS EDITION</span></div></section>

    <section className="section section-events" id="events"><div className="container">
      <SectionHeading eyebrow="THE CAMPUS EDITION" title="On the calendar" action={<Link className="text-link" to="/events">All events <ArrowRight size={16} /></Link>}>
        See what's coming up around campus.
      </SectionHeading>
      {loading ? <Loading label="Finding upcoming events…" /> : error ? <ErrorState message={friendlyError(error)} /> :
        events.length ? <div className="event-grid">{events.map((event) => <EventCard key={event.event_id} event={event} userId={user?.id} />)}</div> :
        <EmptyState icon={CalendarDays} title="A fresh calendar is taking shape" description="Published events will appear here as campus organizers add them." action={<Link to="/events" className="text-link">Browse the event calendar <ArrowRight size={16} /></Link>} />}
    </div></section>

    <section className="section section-categories"><div className="container category-layout">
      <div className="category-intro"><span className="eyebrow">FIND YOUR THING</span><h2>There’s a place<br />for every kind of <em>curious.</em></h2><p>Big stage energy or a small table of ideas. Follow what moves you and see where it leads.</p><Link className="text-link" to="/events">Explore the calendar <ArrowRight size={16} /></Link></div>
      <div className="category-list">{[['01', 'Music & performance', 'Arts'], ['02', 'Ideas & making', 'Technology'], ['03', 'Culture & community', 'Culture'], ['04', 'Move & play', 'Sports']].map(([number, label, category]) =>
        <Link key={number} to={'/events?category=' + encodeURIComponent(category)} className="category-row"><span>{number}</span><strong>{label}</strong><ArrowUpRight size={17} /></Link>)}</div>
    </div></section>

    <section className="section section-fit"><div className="container">
      <div className="home-editorial-heading"><div><span className="eyebrow">EXPLORE BY ENERGY</span><h2>Find your fit</h2></div><Link className="text-link" to="/events">Explore events <ArrowRight size={16} /></Link></div>
      <div className="fit-grid">{[
        [BookOpen, 'Learn', 'Talks, workshops, and fresh ideas to take with you.'],
        [Trophy, 'Compete', 'Challenges, tournaments, and friendly rivalries.'],
        [Sparkles, 'Create', 'Make something, share an idea, and try a new skill.'],
        [Coffee, 'Chill', 'Relaxed hangouts and easy friendships for a slower vibe.'],
        [Users, 'Network', 'Meet future collaborators, peers, and mentors in person.'],
        [HeartHandshake, 'Give back', 'Make your campus stronger and more connected.'],
      ].map(([Icon, title, description]) => <article className="fit-card" key={title}>
        <span className="fit-icon"><Icon size={23} strokeWidth={1.8} /></span><h3>{title}</h3><p>{description}</p>
      </article>)}</div>
    </div></section>

    <section className="section section-momentum"><div className="container">
      <div className="home-editorial-heading"><div><span className="eyebrow">HOW IT WORKS</span><h2>Feel the momentum</h2></div></div>
      <div className="momentum-grid">{[
        [Search, 'Discover', 'Browse campus events that match your energy and interests.'],
        [HeartHandshake, 'Save', 'Keep the events you like close to your plans.'],
        [Ticket, 'Register', 'Reserve a place at events open to student registration.'],
        [Users, 'Show up', 'Meet your campus community and make the week brighter.'],
      ].map(([Icon, title, description], index) => <article className="momentum-card" key={title}>
        <div className="momentum-card-icons"><span className="momentum-number">0{index + 1}</span><span className="fit-icon"><Icon size={23} strokeWidth={1.8} /></span></div>
        <h3>{title}</h3><p>{description}</p>
      </article>)}</div>
    </div></section>

    <section className="section section-manifesto" id="about"><div className="manifesto-inner"><span className="eyebrow">A NOTE FROM MEHFIL</span><h2>More than a calendar.<br /><em>A reason to show up.</em></h2><p>Campus life happens between the lectures. MEHFIL brings the people, projects, and late-afternoon plans into one welcoming place.</p><Link to="/about" className="manifesto-link">A little more about us <ArrowUpRight size={16} /></Link><span className="manifesto-flower">✳</span></div></section>
  </PageFrame>
}

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    query: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    department: '',
    location: '',
    from: '',
    to: '',
    upcoming: true,
  })
  const { user } = useAuth()
  useEffect(() => {
    fetchEvents({ publicOnly: true }).then(setEvents).catch((problem) => setError(problem.message)).finally(() => setLoading(false))
  }, [])
  const filtered = useMemo(() => filterEvents(events, filters), [events, filters])
  const categories = [...new Set(events.map((event) => event.category_name).filter(Boolean))].sort()
  const departments = [...new Set(events.map((event) => event.department_name).filter(Boolean))].sort()
  const locations = [...new Set(events.map((event) => event.venue).filter(Boolean))].sort()
  const change = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }))
    if (name === 'query') {
      const next = new URLSearchParams(searchParams)
      value ? next.set('q', value) : next.delete('q')
      setSearchParams(next, { replace: true })
    }
  }
  return <PageFrame><section className="explore-hero"><div className="container"><span className="eyebrow">THE CAMPUS CALENDAR</span><h1>Find your next <em>thing.</em></h1><p>Good ideas, new people, and plans worth leaving your room for.</p><div className="explore-search"><Search size={19} /><input aria-label="Search events" value={filters.query} onChange={(event) => change('query', event.target.value)} placeholder="Try a title, place, or idea" /><span>SEARCH</span></div></div></section>
    <section className="section explore-results"><div className="container">
      <div className="filters-row">
        <label className="filter-control"><span>Category</span><select value={filters.category} onChange={(event) => change('category', event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={15} /></label>
        <label className="filter-control"><span>Department</span><select value={filters.department} onChange={(event) => change('department', event.target.value)}><option value="">All departments</option>{departments.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={15} /></label>
        <label className="filter-control"><span>Location</span><select value={filters.location} onChange={(event) => change('location', event.target.value)}><option value="">All locations</option>{locations.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={15} /></label>
        <label className="filter-control"><span>From</span><input type="date" value={filters.from} onChange={(event) => change('from', event.target.value)} /></label>
        <label className="filter-control"><span>Until</span><input type="date" value={filters.to} onChange={(event) => change('to', event.target.value)} /></label>
        <label className="upcoming-toggle"><input type="checkbox" checked={filters.upcoming} onChange={(event) => change('upcoming', event.target.checked)} /><span>Upcoming only</span></label>
      </div>
      <div className="results-heading"><span>{loading ? 'Looking around…' : filtered.length + ' ' + (filtered.length === 1 ? 'event' : 'events')}</span><span>Sorted by date <ArrowDownRight size={15} /></span></div>
      {loading ? <Loading label="Loading published events…" /> : error ? <ErrorState message={friendlyError(error)} /> : filtered.length ?
        <div className="event-grid">{filtered.map((event) => <EventCard key={event.event_id} event={event} userId={user?.id} />)}</div> :
        <EmptyState icon={Compass} title="No events on this wavelength" description={events.length ? 'Try a different search or clear a filter to see what else is happening.' : 'There are no published events to show right now. Check back when organizers add to the calendar.'} action={events.length > 0 && <button className="text-link" onClick={() => setFilters({ query: '', category: '', department: '', location: '', from: '', to: '', upcoming: true })}>Clear filters <ArrowRight size={16} /></button>} />}
    </div></section></PageFrame>
}

export function EventDetailsPage() {
  const { eventId } = useParams()
  const { user, profile } = useAuth()
  const [event, setEvent] = useState(null)
  const [myRegistration, setMyRegistration] = useState(null)
  const [lastRegistration, setLastRegistration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const notify = useToast()
  const load = async () => {
    setLoading(true)
    try {
      setError('')
      const result = await fetchEvent(eventId)
      let ownRegistration = null
      if (result && user?.id) {
        const all = await fetchRegistrations({ studentId: user.id })
        ownRegistration = all.find((item) => item.event_id === eventId) || null
        setLastRegistration(ownRegistration)
      }
      if (!user?.id) setLastRegistration(null)
      setMyRegistration(ownRegistration?.registration_status === 'CONFIRMED' ? ownRegistration : null)
      const canViewUnpublished = ['ADMIN', 'ORGANIZER'].includes(profile?.role) || Boolean(ownRegistration)
      setEvent(result?.status === 'PUBLISHED' || canViewUnpublished ? result : null)
    } catch (problem) { setError(problem.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [eventId, user?.id, profile?.role])
  const registered = async () => {
    setBusy(true)
    try {
      const result = await registerForEvent(eventId)
      await load()
      const emailError = await sendEventEmail('registration_confirmed', eventId, result.registrationId)
      notify(emailError ? 'You’re registered. Email confirmation is not configured yet.' : 'You’re registered. Check your inbox for a confirmation.')
    } catch (problem) { notify(friendlyError(problem), 'error') } finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!myRegistration) return
    setBusy(true)
    try {
      await cancelRegistration(myRegistration.registration_id)
      await sendEventEmail('registration_cancelled', eventId, myRegistration.registration_id)
      setConfirmingCancel(false)
      await load()
      notify('Your registration has been cancelled.')
    } catch (problem) { notify(friendlyError(problem), 'error') } finally { setBusy(false) }
  }
  if (loading) return <PageFrame><div className="container page-pad"><Loading /></div></PageFrame>
  if (error || !event) return <PageFrame><div className="container page-pad"><ErrorState message={error ? friendlyError(error) : 'This event could not be found.'} /></div></PageFrame>
  const available = isAvailableEvent(event)
  const student = profile?.role === 'STUDENT'
  const capacity = event.capacity ? Math.max(0, event.capacity - event.confirmedCount) : null
  return <PageFrame><div className="container event-detail-wrap">
    <Link className="back-link" to="/events">← Back to events</Link>
    <div className="detail-grid"><article className="detail-main">
      <div className="detail-art"><div className="detail-art-kicker"><span>MEHFIL / CAMPUS CALENDAR</span><Sparkles size={17} /></div><div className="detail-art-type">{event.category_name || 'Campus event'}</div><div className="detail-art-title">{event.title}</div><div className="detail-art-foot">{event.department_name || 'OPEN TO CAMPUS'} <span>✳</span> {formatDate(event.start_at)}</div></div>
      <div className="detail-content"><div className="detail-category"><span>{event.category_name || 'Campus event'}</span><StatusBadge value={event.status} /></div><h1>{event.title}</h1><p className="detail-description">{event.description || 'The organizer has not added a description yet.'}</p>
        <div className="detail-facts"><div><CalendarDays /><span><small>WHEN</small><strong>{formatDate(event.start_at)}</strong><em>{formatTime(event.start_at)}{event.end_at ? ' – ' + formatTime(event.end_at) : ''}</em></span></div><div><Compass /><span><small>WHERE</small><strong>{event.venue || 'Venue to be announced'}</strong><em>{event.department_name || 'Campus'}</em></span></div><div><Users /><span><small>HOSTED BY</small><strong>{event.organizer?.organization_name || event.organizer?.full_name || 'Campus organizer'}</strong><em>{event.department_name || 'MEHFIL community'}</em></span></div><div><Ticket /><span><small>REGISTRATION CLOSES</small><strong>{formatDate(event.registration_deadline)}</strong><em>{event.capacity ? event.capacity + ' places total' : 'Open capacity'}</em></span></div></div>
      </div></article>
      <aside className="registration-panel"><span className="eyebrow">SAVE YOUR PLACE</span><h2>Be part of it.</h2><p>Make a little room in your calendar. The best campus memories rarely happen by accident.</p>{lastRegistration?.registration_status === 'CANCELLED' && <div className="previous-registration"><StatusBadge value="CANCELLED" /> Your previous registration was cancelled.</div>}
        {myRegistration ? <div className="registered-state"><div><Check size={18} /> You’re on the list</div><StatusBadge value={myRegistration.registration_status} /><p>Your registration is confirmed.</p><Button variant="outline" disabled={busy} onClick={() => setConfirmingCancel(true)}>Cancel registration</Button></div> :
          available && student ? <Button className="full-width" disabled={busy} onClick={registered}>{busy ? 'Saving your place…' : 'Register now'} <ArrowUpRight size={17} /></Button> :
          available && !user ? <Link className="button button-primary full-width" to={'/login?next=' + encodeURIComponent('/events/' + eventId)}>Log in to register <ArrowUpRight size={17} /></Link> :
          available && !student ? <p className="notice-box">Registration is available to student accounts.</p> :
          <p className="notice-box">Registration is closed for this event.</p>}
        <div className="panel-detail"><span>EVENT DATE</span><strong>{formatDate(event.start_at)}</strong></div><div className="panel-detail"><span>VENUE</span><strong>{event.venue || 'To be announced'}</strong></div>
      </aside></div>
    {confirmingCancel && <div className="dialog-backdrop"><div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><span className="eyebrow">CHANGE OF PLANS?</span><h2 id="cancel-title">Cancel your place?</h2><p>Your registration will be marked cancelled. You can register again if places are still available.</p><div className="dialog-actions"><Button variant="quiet" onClick={() => setConfirmingCancel(false)}>Keep my place</Button><Button variant="danger" disabled={busy} onClick={cancel}>Yes, cancel</Button></div></div></div>}
  </div></PageFrame>
}

export function AboutPage() {
  return <PageFrame><section className="about-hero"><div className="container"><span className="eyebrow">WHY WE GATHER</span><h1>Campus is a place.<br /><em>Community is what we make.</em></h1><p>MEHFIL is a shared front door for all the things that make student life feel alive: a curious talk, a first performance, a table full of people you haven’t met yet.</p><Link className="button button-primary" to="/events">Find something to join <ArrowRight size={17} /></Link></div></section><section className="section"><div className="container about-values"><div><HeartHandshake /><h2>Everyone belongs</h2><p>We make it easier for every student to find their people and take part in campus life.</p></div><div><Sparkles /><h2>Make room for ideas</h2><p>From a tiny workshop to a packed auditorium, every good gathering starts with an invitation.</p></div><div><ShieldCheck /><h2>Built on trust</h2><p>Clear information, real organizers, and dependable registration make showing up simple.</p></div></div></section></PageFrame>
}

export function ContactPage() {
  return <PageFrame><section className="about-hero contact-hero"><div className="container"><span className="eyebrow">GET IN TOUCH</span><h1>We’d love to<br /><em>hear from you.</em></h1><p>Questions about MEHFIL, an event, or bringing your campus community together? Send us a note and we’ll be glad to hear from you.</p><a className="button button-primary" href="mailto:hello@mehfil.events">Email MEHFIL <ArrowUpRight size={17} /></a></div></section><section className="section"><div className="container about-values contact-values"><div><Mail /><h2>General enquiries</h2><p>Questions, feedback, or ideas for making campus life better.</p><a href="mailto:hello@mehfil.events">hello@mehfil.events</a></div><div><CalendarDays /><h2>Events & registration</h2><p>Need help finding an event or managing your registration? Get in touch by email.</p><a href="mailto:hello@mehfil.events">Email event support</a></div><div><Users /><h2>Campus organizers</h2><p>Want to bring your club, department, or organization onto MEHFIL?</p><a href="mailto:hello@mehfil.events">Talk to our team</a></div></div></section></PageFrame>
}

function AuthFrame({ children, title, subtitle, aside = false }) {
  const { theme, toggleTheme } = useTheme()
  return <div className="auth-layout"><div className="auth-aside"><Link to="/" className="auth-aside-brand"><img className="brand-logo" src={mehfilLogo} alt="" /> MEHFIL</Link><div className="auth-aside-copy"><span className="eyebrow">WHERE CAMPUS COMES TOGETHER</span><h2>There’s a place<br />for every <em>you.</em></h2><p>Good people. New ideas. A calendar that makes room for both.</p><span className="auth-aside-spark">✳</span></div><span className="auth-aside-foot">MEHFIL · CAMPUS LIFE</span></div><div className="auth-main"><button className="auth-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button><div className="auth-mobile-brand"><Link to="/"><img className="brand-logo" src={mehfilLogo} alt="" /> MEHFIL</Link></div><div className="auth-card"><span className="eyebrow">{aside ? 'YOUR CAMPUS IS CALLING' : 'WELCOME TO MEHFIL'}</span><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</div></div></div>
}

export function LoginPage() {
  const { user, profile, signIn, configured } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const notify = useToast()
  const [form, setForm] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (user && profile) return <Navigate to={dashboardForRole(profile.role)} replace />
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await signIn(form.email, form.password)
      const next = params.get('next')
      navigate(next?.startsWith('/') ? next : '/app', { replace: true })
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }
  return <AuthFrame title="Welcome back." subtitle="Your campus calendar is waiting.">
    {!configured && <div className="notice-box">Connect the Supabase project in .env.local before signing in.</div>}
    <form onSubmit={submit} className="auth-form"><Field label="Email address"><input type="email" required autoComplete="email" placeholder="you@college.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Password"><span className="password-field"><input type={show ? 'text' : 'password'} required autoComplete="current-password" placeholder="Your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></Field>{error && <p className="form-error" role="alert">{error}</p>}
      <div className="auth-meta"><span>Session saved securely on this device</span><Link to="/forgot-password">Forgot password?</Link></div><Button className="full-width" disabled={busy}>{busy ? 'Signing in…' : 'Log in'} <ArrowRight size={17} /></Button>
    </form><p className="auth-switch">New around here? <Link to="/register">Create an account</Link></p>
  </AuthFrame>
}

export function RegisterPage() {
  const { user, profile, signUp, signOut, configured } = useAuth()
  const navigate = useNavigate()
  const [accountType, setAccountType] = useState('STUDENT')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', password: '', confirm: '',
    studentNumber: '', department: '', collegeName: '', yearOfStudy: '',
    organizationName: '', organizationType: '', designation: '',
  })
  const update = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }))
  const organizerPending = user && profile?.role === 'STUDENT' && user.user_metadata?.register_as === 'ORGANIZER'
  if (user && profile && !organizerPending) return <Navigate to={dashboardForRole(profile.role)} replace />

  const submit = async (event) => {
    event.preventDefault()
    setError(''); setSuccess('')
    if (form.password.length < 8) return setError('Choose a password with at least 8 characters.')
    if (form.password !== form.confirm) return setError('Your passwords do not match.')
    setBusy(true)
    try {
      const result = await signUp({ ...form, accountType })
      if (result.session && accountType === 'STUDENT') {
        navigate('/student', { replace: true })
      } else if (result.session && result.profile?.role === 'ORGANIZER') {
        navigate('/organizer', { replace: true })
      } else if (result.session && result.organizerPending) {
        setSuccess('Your account is signed in. Organizer access is waiting for the secure onboarding function to activate.')
      } else if (accountType === 'ORGANIZER') {
        setSuccess('Check your email to verify your account. Organizer access will activate when you sign in.')
      } else {
        setSuccess('Your student account is ready to verify. Check your email for the confirmation link, then log in.')
      }
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }

  return <AuthFrame title="Create Account" subtitle="Join the platform and get started." aside>
    {!configured && <div className="notice-box">Connect the Supabase project in .env.local before creating an account.</div>}
    {organizerPending ? <div className="pending-organizer"><span className="eyebrow">ORGANIZER SETUP</span><h2>One last step.</h2><p>{success || 'Your database profile still shows student access. Organizer onboarding will retry when you sign in after the function is deployed.'}</p><Button variant="outline" onClick={async () => { await signOut(); navigate('/login') }}>Log out and return to login</Button></div> :
    <form onSubmit={submit} className="auth-form register-form">
      <fieldset className="account-type-field"><legend>Register as</legend><div className="account-type-switch" role="radiogroup" aria-label="Register as">
        <button type="button" role="radio" aria-checked={accountType === 'STUDENT'} className={accountType === 'STUDENT' ? 'account-type-active' : ''} onClick={() => setAccountType('STUDENT')}>Student</button>
        <button type="button" role="radio" aria-checked={accountType === 'ORGANIZER'} className={accountType === 'ORGANIZER' ? 'account-type-active' : ''} onClick={() => setAccountType('ORGANIZER')}>Organiser</button>
      </div></fieldset>

      <Field label="Full name"><input required autoComplete="name" placeholder="Enter your full name" value={form.fullName} onChange={update('fullName')} /></Field>
      {accountType === 'STUDENT' ? <div className="conditional-fields">
        <span className="form-section-tag">Student details</span>
        <div className="form-two"><Field label="Roll Number"><input required value={form.studentNumber} onChange={update('studentNumber')} /></Field><Field label="Department"><input required placeholder="Department name" value={form.department} onChange={update('department')} /></Field></div>
        <div className="form-two"><Field label="College"><input required placeholder="Institution name" value={form.collegeName} onChange={update('collegeName')} /></Field><Field label="Year of Study"><input required placeholder="First, Second, Third, Fourth year" value={form.yearOfStudy} onChange={update('yearOfStudy')} /></Field></div>
      </div> : <div className="conditional-fields">
        <span className="form-section-tag">Organiser details</span>
        <Field label="Organization Name"><input required placeholder="Enter organization name" value={form.organizationName} onChange={update('organizationName')} /></Field>
        <Field label="Organization Type"><input required placeholder="College Club, Student Council, Department, External Organization" value={form.organizationType} onChange={update('organizationType')} /></Field>
        <Field label="Designation"><input required placeholder="President, Secretary, Coordinator, Faculty, etc." value={form.designation} onChange={update('designation')} /></Field>
      </div>}

      <Field label="Phone number"><input type="tel" required autoComplete="tel" placeholder="Enter your phone number" value={form.phone} onChange={update('phone')} /></Field>
      <Field label="Email address"><input type="email" required autoComplete="email" placeholder="example@email.com" value={form.email} onChange={update('email')} /></Field>
      <Field label="Password"><span className="password-field"><input type={show ? 'text' : 'password'} required autoComplete="new-password" value={form.password} onChange={update('password')} /><button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></Field>
      <Field label="Confirm password"><input type={show ? 'text' : 'password'} required autoComplete="new-password" value={form.confirm} onChange={update('confirm')} /></Field>
      {accountType === 'ORGANIZER' && <p className="form-help">Organizer access is written by the authenticated onboarding function. Admin access is never offered here.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}
      <Button className="full-width" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={17} /></Button>
    </form>}
    {!organizerPending && <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>}
  </AuthFrame>
}
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })
      if (resetError) throw resetError
      setMessage('If an account exists for this address, a reset link is on its way.')
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }
  return <AuthFrame title="A fresh start." subtitle="We’ll send you a link to reset your password."><form onSubmit={submit} className="auth-form"><Field label="Email address"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<Button className="full-width" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <ArrowRight size={17} /></Button></form><p className="auth-switch"><Link to="/login">Back to log in</Link></p></AuthFrame>
}



export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError(''); setSuccess('')
    if (password.length < 8) return setError('Choose a password with at least 8 characters.')
    if (password !== confirm) return setError('Your passwords do not match.')
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess('Your password has been changed. You can log in now.')
      window.setTimeout(() => navigate('/login', { replace: true }), 1100)
    } catch (problem) { setError(friendlyError(problem)) } finally { setBusy(false) }
  }
  return <AuthFrame title="Choose a new password." subtitle="A fresh password, then you’re back in."><form onSubmit={submit} className="auth-form"><Field label="New password"><input type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Confirm new password"><input type="password" required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}<Button className="full-width" disabled={busy}>{busy ? 'Updating…' : 'Update password'} <ArrowRight size={17} /></Button></form><p className="auth-switch"><Link to="/login">Back to log in</Link></p></AuthFrame>
}





