import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
export const api = axios.create({ baseURL, timeout: 20000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('srsp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('srsp_token')) {
      window.dispatchEvent(new Event('srsp:unauthorized'))
    }
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Request failed'
    return Promise.reject(new Error(message))
  },
)

export const imageUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const serverOrigin = new URL(baseURL).origin
  return `${serverOrigin}${url.startsWith('/') ? '' : '/'}${url}`
}

export const getItems = (response) => response?.data?.items || []
export const localDateISO = (value = new Date()) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
