import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isDeptAdmin, setIsDeptAdmin] = useState(false)
  const [userDeptId, setUserDeptId] = useState(null)
  const [adminDeptId, setAdminDeptId] = useState(null)
  const [userMemberId, setUserMemberId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserInfo(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserInfo(session.user.id)
      } else {
        setIsAdmin(false)
        setIsDeptAdmin(false)
        setUserDeptId(null)
        setAdminDeptId(null)
        setUserMemberId(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserInfo(userId) {
    try {
      const [{ data: roleData }, { data: memberData }] = await Promise.all([
        supabase.from('user_roles').select('role, department_id').eq('user_id', userId).maybeSingle(),
        supabase.from('department_members').select('id, department_id').eq('user_id', userId).maybeSingle()
      ])
      setIsAdmin(roleData?.role === 'admin')
      setIsDeptAdmin(roleData?.role === 'dept_admin')
      setAdminDeptId(roleData?.role === 'dept_admin' ? roleData?.department_id : null)
      setUserDeptId(memberData?.department_id || null)
      setUserMemberId(memberData?.id || null)
    } catch {
      setIsAdmin(false)
      setIsDeptAdmin(false)
      setUserDeptId(null)
      setAdminDeptId(null)
      setUserMemberId(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, isAdmin, isDeptAdmin, userDeptId, adminDeptId, userMemberId, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
