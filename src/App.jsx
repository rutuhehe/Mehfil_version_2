import { useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Footer, Loading, Navbar, PageFrame, ToastProvider } from './components/ui'
import {
  AboutPage, AuthConfirmPage, ContactPage, EventDetailsPage, ExplorePage, ForgotPasswordPage, HomePage, LoginPage, RegisterPage, ResetPasswordPage,
} from './pages/PublicPages'
import {
  AdminAttendancePage, AdminDashboard, AdminEventsPage, AdminRegistrationsPage, AdminUsersPage,
} from './pages/AdminPages'
import { OrganizerAttendancePage } from './pages/OrganizerAttendancePage'
import { OrganizerDashboard, OrganizerEventFormPage, OrganizerEventsPage, OrganizerParticipantsPage } from './pages/OrganizerPages'
import {
  NotificationsPage, ProfilePage, SavedEventsPage, StudentDashboard, StudentRegistrationsPage,
} from './pages/StudentPages'
import { canAccessRole, dashboardForRole } from './utils/events'

function ProtectedLayout() {
  const { user, loading, profile, profileError, sessionUserMissing, clearLocalSession } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (!loading && sessionUserMissing) void clearLocalSession()
  }, [loading, sessionUserMissing, clearLocalSession])
  if (loading) return <div className="app-loading"><Loading label="Getting your campus ready…" /></div>
  if (sessionUserMissing) return <Navigate to="/" replace />
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(location.pathname)} replace />
  if (!profile) return <><Navbar /><main className="container page-pad"><div className="profile-missing"><h1>Your account is signed in</h1><p>{profileError || 'We could not find a MEHFIL profile for this account. Ask a campus administrator to check your access.'}</p><p>Public signups become student accounts after the project’s profile trigger runs.</p></div></main><Footer /></>
  if (profile.is_active === false) return <><Navbar /><main className="container page-pad"><div className="profile-missing"><h1>This account is inactive</h1><p>Contact a campus administrator to restore access to MEHFIL.</p></div></main><Footer /></>
  return <><Navbar />{profileError && location.pathname !== '/profile' && <div className="profile-warning-banner"><span>{profileError}</span><Link to="/profile">View profile</Link></div>}<Outlet /><Footer /></>
}

function RoleGate({ roles }) {
  const { profile, user } = useAuth()
  const organizerRequestPending = profile?.role === 'STUDENT'
    && user?.user_metadata?.register_as === 'ORGANIZER'
    && profile?.organizer_request_status !== 'REJECTED'
    && profile?.organizer_request_status !== 'APPROVED'
  if (organizerRequestPending) return <Navigate to="/profile" replace />
  if (!canAccessRole(profile, roles)) return <Navigate to={dashboardForRole(profile?.role)} replace />
  return <Outlet />
}

function AppRoutes() {
  const { profile, sessionUserMissing, clearSessionUserMissing } = useAuth()
  const location = useLocation()
  useEffect(() => {
    if (location.pathname === '/' && sessionUserMissing) clearSessionUserMissing()
  }, [location.pathname, sessionUserMissing, clearSessionUserMissing])
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/events" element={<ExplorePage />} />
    <Route path="/events/:eventId" element={<EventDetailsPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/auth/confirm" element={<AuthConfirmPage />} />
    <Route path="/app" element={<Navigate to={dashboardForRole(profile?.role)} replace />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route element={<RoleGate roles={['STUDENT']} />}>
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/registrations" element={<StudentRegistrationsPage />} />
        <Route path="/student/saved" element={<SavedEventsPage />} />
      </Route>
      <Route element={<RoleGate roles={['ORGANIZER']} />}>
        <Route path="/organizer" element={<OrganizerDashboard />} />
        <Route path="/organizer/events" element={<OrganizerEventsPage />} />
        <Route path="/organizer/events/new" element={<OrganizerEventFormPage />} />
        <Route path="/organizer/events/:eventId/edit" element={<OrganizerEventFormPage />} />
        <Route path="/organizer/participants" element={<OrganizerParticipantsPage />} />
        <Route path="/organizer/attendance" element={<OrganizerAttendancePage />} />
      </Route>
      <Route element={<RoleGate roles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/events" element={<AdminEventsPage />} />
        <Route path="/admin/events/new" element={<OrganizerEventFormPage />} />
        <Route path="/admin/events/:eventId/edit" element={<OrganizerEventFormPage />} />
        <Route path="/admin/registrations" element={<AdminRegistrationsPage />} />
        <Route path="/admin/attendance" element={<AdminAttendancePage />} />
      </Route>
    </Route>
    <Route path="*" element={<PageFrame><div className="container page-pad"><h1>That page wandered off.</h1><p>Let’s find you something happening on campus.</p><a className="button button-primary" href="/events">Explore events</a></div></PageFrame>} />
  </Routes>
}

export default function App() {
  return <ThemeProvider><AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></ThemeProvider>
}




