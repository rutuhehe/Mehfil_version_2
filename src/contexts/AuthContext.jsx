import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../lib/supabase'
import { fetchProfile } from '../services/api'

const AuthContext = createContext(null)

async function rollNumberExists(studentNumber) {
  try {
    const { data, error } = await supabase.rpc('student_number_exists', {
      p_student_number: studentNumber,
    })
    if (error) {
      console.warn('Roll number lookup is unavailable; signup will rely on database validation.', error)
      return null
    }
    return data === true
  } catch (error) {
    console.warn('Roll number lookup is unavailable; signup will rely on database validation.', error)
    return null
  }
}

async function resolveProfile(authUser) {
  let profile = await fetchProfile(authUser.id)
  if (!profile) {
    // A browser can keep a locally cached session after its Auth user is deleted.
    // Check with Auth so a missing profile row alone does not sign out a valid user.
    try {
      const { error } = await supabase.auth.getUser()
      if (error && ([400, 401, 403, 404].includes(error.status) || error.code === 'user_not_found')) {
        return { profile: null, warning: '', sessionUserMissing: true }
      }
    } catch {
      // A network failure should not be mistaken for a deleted account.
    }
  }
  return { profile, warning: '', sessionUserMissing: false }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [sessionUserMissing, setSessionUserMissing] = useState(false)

  useEffect(() => {
    if (!supabaseReady || !supabase) {
      setLoading(false)
      return undefined
    }
    let alive = true
    const hydrate = async (authSession) => {
      setSession(authSession)
      if (!authSession?.user) {
        setProfile(null)
        setProfileError('')
        setLoading(false)
        return
      }
      setSessionUserMissing(false)
      try {
        const result = await resolveProfile(authSession.user)
        if (alive) {
          setProfile(result.profile)
          setSessionUserMissing(Boolean(result.sessionUserMissing))
          setProfileError(result.warning || (!result.profile && !result.sessionUserMissing ? 'Your account exists, but its MEHFIL profile is not available yet.' : ''))
        }
      } catch (error) {
        if (alive) {
          setProfile(null)
          setSessionUserMissing(false)
          setProfileError(error.message || 'Unable to load your profile.')
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    supabase.auth.getSession().then(({ data }) => hydrate(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      queueMicrotask(() => hydrate(authSession))
    })
    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and publishable key to .env.local.')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setSession(data.session)
    setSessionUserMissing(false)
    if (data.user) {
      const result = await resolveProfile(data.user)
      setProfile(result.profile)
      setSessionUserMissing(Boolean(result.sessionUserMissing))
      setProfileError(result.warning)
    }
    return data
  }

  const signUp = async (form) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and publishable key to .env.local.')
    const isOrganizer = form.accountType === 'ORGANIZER'
    const studentNumber = isOrganizer ? null : form.studentNumber.trim()
    if (!isOrganizer && await rollNumberExists(studentNumber)) {
      throw new Error('Roll Number already exists')
    }
    const metadata = {
      full_name: form.fullName.trim(),
      phone_number: form.phone.trim(),
      register_as: form.accountType,
      student_number: studentNumber,
      department_name: isOrganizer ? null : form.department.trim(),
      college_name: isOrganizer ? null : form.collegeName.trim(),
      year_of_study: isOrganizer ? null : form.yearOfStudy,
      organization_name: isOrganizer ? form.organizationName.trim() : null,
      organization_type: isOrganizer ? form.organizationType : null,
      designation: isOrganizer ? form.designation.trim() : null,
    }
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    if (error) {
      // The Auth API can hide profile-trigger details behind a generic database
      // error, so recheck the roll number to report a useful duplicate message.
      if (!isOrganizer && await rollNumberExists(studentNumber)) {
        throw new Error('Roll No already exists')
      }
      throw error
    }
    let resultProfile = null
    let organizerPending = false
    if (data.session && data.user) {
      const result = await resolveProfile(data.user)
      resultProfile = result.profile
      organizerPending = Boolean(isOrganizer
        && result.profile?.role !== 'ORGANIZER'
        && result.profile?.organizer_request_status !== 'REJECTED')
      setSession(data.session)
      setProfile(result.profile)
      setSessionUserMissing(Boolean(result.sessionUserMissing))
      setProfileError(result.warning)
    }
    return { ...data, profile: resultProfile, organizerPending }
  }

  const resendSignupConfirmation = async (email) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and publishable key to .env.local.')
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    setSession(null)
    setProfile(null)
    setProfileError('')
    setSessionUserMissing(false)
  }

  const clearLocalSession = useCallback(async () => {
    if (supabase) {
      try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    }
    setSession(null)
    setProfile(null)
    setProfileError('')
    // Keep the deleted-user signal until the router reaches the home page.
  }, [])

  const clearSessionUserMissing = useCallback(() => setSessionUserMissing(false), [])

  const deleteAccount = async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } })
    if (error) {
      if (error.name === 'FunctionsFetchError') {
        throw new Error('Could not reach the account deletion service. Confirm the delete-account Edge Function is deployed to this Supabase project, then try again.')
      }
      let message = error.message
      try { message = (await error.context.json()).error || message } catch {}
      throw new Error(message)
    }
    try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    setSession(null)
    setProfile(null)
    setProfileError('')
    setSessionUserMissing(false)
    return data
  }

  const refreshProfile = async () => {
    if (!session?.user?.id) return null
    const result = await resolveProfile(session.user)
    setProfile(result.profile)
    setSessionUserMissing(Boolean(result.sessionUserMissing))
    setProfileError(result.warning)
    return result.profile
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user || null, profile, loading, profileError, sessionUserMissing,
      configured: supabaseReady, signIn, signUp, resendSignupConfirmation, signOut, deleteAccount, refreshProfile,
      clearLocalSession, clearSessionUserMissing,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

