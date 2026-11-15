import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../lib/supabase'
import { fetchProfile } from '../services/api'

const AuthContext = createContext(null)

async function resolveProfile(authUser) {
  let profile = await fetchProfile(authUser.id)
  const requestedOrganizer = authUser.user_metadata?.register_as === 'ORGANIZER'
  if (requestedOrganizer && profile?.role === 'STUDENT') {
    const { error } = await supabase.functions.invoke('register-organizer', { body: {} })
    if (error) return { profile, warning: 'Organizer access is waiting for activation. Sign in again after onboarding is configured.' }
    profile = await fetchProfile(authUser.id)
    if (profile?.role !== 'ORGANIZER') {
      return { profile, warning: 'Organizer access is waiting for activation. Please contact a campus administrator.' }
    }
  }
  return { profile, warning: '' }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

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
      try {
        const result = await resolveProfile(authSession.user)
        if (alive) {
          setProfile(result.profile)
          setProfileError(result.warning || (!result.profile ? 'Your account exists, but its MEHFIL profile is not available yet.' : ''))
        }
      } catch (error) {
        if (alive) {
          setProfile(null)
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
    if (data.user) {
      const result = await resolveProfile(data.user)
      setProfile(result.profile)
      setProfileError(result.warning)
    }
    return data
  }

  const signUp = async (form) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and publishable key to .env.local.')
    const isOrganizer = form.accountType === 'ORGANIZER'
    const metadata = {
      full_name: form.fullName.trim(),
      phone_number: form.phone.trim(),
      register_as: form.accountType,
      student_number: isOrganizer ? null : form.studentNumber.trim(),
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
      options: { data: metadata },
    })
    if (error) throw error
    let resultProfile = null
    let organizerPending = false
    if (data.session && data.user) {
      const result = await resolveProfile(data.user)
      resultProfile = result.profile
      organizerPending = Boolean(result.warning)
      setSession(data.session)
      setProfile(result.profile)
      setProfileError(result.warning)
    }
    return { ...data, profile: resultProfile, organizerPending }
  }

  const signOut = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    setSession(null)
    setProfile(null)
    setProfileError('')
  }

  const deleteAccount = async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } })
    if (error) {
      let message = error.message
      try { message = (await error.context.json()).error || message } catch {}
      throw new Error(message)
    }
    try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    setSession(null)
    setProfile(null)
    setProfileError('')
    return data
  }

  const refreshProfile = async () => {
    if (!session?.user?.id) return null
    const result = await resolveProfile(session.user)
    setProfile(result.profile)
    setProfileError(result.warning)
    return result.profile
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user || null, profile, loading, profileError,
      configured: supabaseReady, signIn, signUp, signOut, deleteAccount, refreshProfile,
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

