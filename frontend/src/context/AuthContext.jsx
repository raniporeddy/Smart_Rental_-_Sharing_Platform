import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)
const USER_KEY = 'srsp_user'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('srsp_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
  })
  const [savedIds, setSavedIds] = useState([])

  const setSession = useCallback((payload) => {
    localStorage.setItem('srsp_token', payload.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user))
    setToken(payload.access_token)
    setUser(payload.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('srsp_token')
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    setSavedIds([])
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!token) return null
    const { data } = await api.get('/auth/profile')
    setUser(data.user)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    return data.user
  }, [token])

  const refreshSaved = useCallback(async () => {
    if (!token) return []
    const { data } = await api.get('/users/me/saved-products')
    const ids = (data.items || []).map((item) => item.id)
    setSavedIds(ids)
    return ids
  }, [token])

  const toggleSaved = useCallback(async (productId) => {
    if (!token) throw new Error('Sign in to save listings')
    const isSaved = savedIds.includes(productId)
    if (isSaved) await api.delete(`/users/me/saved-products/${productId}`)
    else await api.post(`/users/me/saved-products/${productId}`)
    setSavedIds((ids) => isSaved ? ids.filter((id) => id !== productId) : [...ids, productId])
    return !isSaved
  }, [savedIds, token])

  useEffect(() => {
    if (token) refreshSaved().catch(() => {})
  }, [refreshSaved, token])

  useEffect(() => {
    const onUnauthorized = () => logout()
    window.addEventListener('srsp:unauthorized', onUnauthorized)
    return () => window.removeEventListener('srsp:unauthorized', onUnauthorized)
  }, [logout])

  const value = useMemo(() => ({ token, user, savedIds, setSession, logout, refreshProfile, refreshSaved, toggleSaved }),
    [token, user, savedIds, setSession, logout, refreshProfile, refreshSaved, toggleSaved])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
