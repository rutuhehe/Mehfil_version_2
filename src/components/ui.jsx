import { createContext, useContext, useEffect, useState } from 'react'
import {
  ArrowUpRight, Bookmark, CalendarDays, Check, Clock3, MapPin, Moon, Sparkles, Sun, Users,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import mehfilLogo from '../assets/mehfil-logo.jpeg'
import { dashboardForRole } from '../utils/events'
import { formatDate } from '../utils/format'
import { getSavedEvents, toggleSavedEvent } from '../utils/savedEvents'

const ToastContext = createContext(() => {})
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const notify = (message, type = 'success') => {
    setToast({ message, type })
    window.clearTimeout(notify.timer)
    notify.timer = window.setTimeout(() => setToast(null), 3800)
  }
  return <ToastContext.Provider value={notify}>
    {children}
    {toast && <div className={'toast toast-' + toast.type} role="status"><span>{toast.type === 'success' ? <Check size={16} /> : '!'}</span>{toast.message}</div>}
  </ToastContext.Provider>
}
export const useToast = () => useContext(ToastContext)

export function Brand({ light = false }) {
  return <Link to="/" className={'brand' + (light ? ' brand-light' : '')} aria-label="MEHFIL home">
    <img className="brand-logo" src={mehfilLogo} alt="" /><span>MEHFIL</span>
  </Link>
}

function navFor(role) {
  if (role === 'STUDENT') return [
    ['Dashboard', '/student'], ['Explore', '/events'], ['My registrations', '/student/registrations'], ['Saved', '/student/saved'], ['Notifications', '/notifications'], ['Profile', '/profile'],
  ]
  if (role === 'ORGANIZER') return [
    ['Dashboard', '/organizer'], ['My events', '/organizer/events'], ['Participants', '/organizer/participants'], ['Check-in', '/organizer/attendance'], ['Notifications', '/notifications'], ['Profile', '/profile'],
  ]
  if (role === 'ADMIN') return [
    ['Overview', '/admin'], ['Users', '/admin/users'], ['Events', '/admin/events'], ['Registrations', '/admin/registrations'], ['Attendance', '/admin/attendance'], ['Notifications', '/notifications'], ['Profile', '/profile'],
  ]
  return [['Home', '/'], ['Explore events', '/events'], ['About', '/about'], ['Contact', '/contact']]
}

export function Navbar() {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const items = navFor(profile?.role)
  const { theme, toggleTheme } = useTheme()
  return <header className="site-header">
    <div className="nav-wrap">
      <Brand />
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}><span></span><span></span></button>
      <nav className={'main-nav' + (open ? ' nav-open' : '')}>
        <div className="nav-links">{items.map(([label, path]) =>
          <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>{label}</NavLink>
        )}</div>
        <div className="nav-actions">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
          {!user && <><Link className="nav-login" to="/login" onClick={() => setOpen(false)}>Log in</Link><Link className="button button-primary button-small" to="/register" onClick={() => setOpen(false)}>Join MEHFIL <ArrowUpRight size={15} /></Link></>}
        </div>
      </nav>
    </div>
  </header>
}

export function Footer() {
  return <footer className="footer"><div className="footer-inner">
    <div><Brand light /><p>Where campus comes together.</p></div>
    <div className="footer-links"><Link to="/events">Explore events</Link><Link to="/about">About MEHFIL</Link><Link to="/contact">Contact</Link></div>
    <span className="footer-note">Made for the moments in between.</span>
  </div></footer>
}

export function PageFrame({ children, footer = true }) {
  return <><Navbar /><main>{children}</main>{footer && <Footer />}</>
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={'button button-' + variant + (className ? ' ' + className : '')} {...props}>{children}</button>
}

export function SectionHeading({ eyebrow, title, children, action }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{children && <p>{children}</p>}</div>{action}</div>
}

const categoryThemes = {
  Music: 'theme-lilac', Arts: 'theme-coral', Technology: 'theme-blue', Culture: 'theme-gold',
  Sports: 'theme-green', Workshop: 'theme-pink', default: 'theme-lilac',
}
export function EventCard({ event, userId, onSave }) {
  const theme = categoryThemes[event.category_name] || categoryThemes.default
  const [saved, setSaved] = useState(() => userId ? getSavedEvents(userId).includes(event.event_id) : false)
  useEffect(() => setSaved(userId ? getSavedEvents(userId).includes(event.event_id) : false), [userId, event.event_id])
  const handleSave = () => {
    if (userId) { const next = toggleSavedEvent(userId, event.event_id); setSaved(next.includes(event.event_id)); onSave?.(next) }
  }
  return <article className="event-card">
    <Link to={'/events/' + event.event_id} className={'event-art ' + theme} aria-label={'View ' + event.title}>
      <span className="art-orbit orbit-one"></span><span className="art-orbit orbit-two"></span>
      <span className="art-date"><strong>{new Date(event.start_at).getDate()}</strong><small>{new Date(event.start_at).toLocaleDateString(undefined, { month: 'short' })}</small></span>
      <span className="art-spark"><Sparkles size={22} /></span>
      <span className="art-word">{event.category_name || 'Campus'}<br /><i>collective</i></span>
      <span className="art-bottom">MEHFIL · CAMPUS LIFE</span>
    </Link>
    <div className="event-card-body">
      <div className="event-kicker"><span>{event.category_name || 'Campus event'}</span>{userId && <button className={'save-button' + (saved ? ' is-saved' : '')} aria-label={saved ? 'Unsave event' : 'Save event'} onClick={handleSave}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button>}</div>
      <h3><Link to={'/events/' + event.event_id}>{event.title}</Link></h3>
      <div className="event-meta"><span><CalendarDays size={15} />{formatDate(event.start_at, { month: 'short', day: 'numeric' })}</span><span><MapPin size={15} />{event.venue}</span></div>
      <div className="event-card-foot"><span>{event.organizer?.organization_name || event.organizer?.full_name || event.department_name || 'MEHFIL community'}</span><Link to={'/events/' + event.event_id} aria-label="View event"><ArrowUpRight size={18} /></Link></div>
    </div>
  </article>
}

export function StatusBadge({ value }) {
  const normalized = String(value || 'UNKNOWN').toLowerCase().replaceAll('_', '-')
  return <span className={'status-badge status-' + normalized}>{String(value || 'UNKNOWN').replaceAll('_', ' ')}</span>
}

export function StatCard({ label, value, note, icon: Icon = Users, tone = '' }) {
  return <div className={'stat-card ' + tone}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><strong>{value ?? '—'}</strong>{note && <small>{note}</small>}</div>
}

export function EmptyState({ icon: Icon = CalendarDays, title, description, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={23} /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}
export function Loading({ label = 'Loading your MEHFIL…' }) {
  return <div className="loading-state"><span className="spinner"></span><span>{label}</span></div>
}
export function ErrorState({ message, retry }) {
  return <div className="error-state"><strong>Something needs attention</strong><p>{message}</p>{retry && <Button variant="outline" onClick={retry}>Try again</Button>}</div>
}
export function Field({ label, error, children, hint, hintClassName }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small className={hintClassName}>{hint}</small>}{error && <small className="field-error">{error}</small>}</label>
}
export function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}
export function LoadingDots() { return <span className="loading-dots"><Clock3 size={15} /> Please wait</span> }



