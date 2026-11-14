import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowLeft, Home as HomeIcon } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ChatWidget, Navbar } from './components/Shared'
import Home from './pages/Home'
import Browse from './pages/Browse'
import ProductDetail from './pages/ProductDetail'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'

function PrivateRoute({ children }) {
  const { token, user } = useAuth()
  const location = useLocation()
  return token && user ? children : <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
}

function AdminRoute({ children }) {
  const { token, user } = useAuth()
  const location = useLocation()
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return user.role === 'admin' ? children : <Navigate to="/dashboard" replace />
}

function ScrollManager() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  return null
}

function Footer() {
  return <footer className="site-footer"><div className="page-container footer-inner"><Link to="/" className="brand"><span className="brand-mark"><span>↗</span></span><span>sharely<span className="brand-dot">.</span></span></Link><span>Share more. Waste less. Live a little lighter.</span><div><Link to="/browse">Browse rentals</Link><Link to="/dashboard">List an item</Link></div><small>© {new Date().getFullYear()} Sharely · Built for the neighborhood.</small></div></footer>
}

function SiteLayout({ children }) {
  return <><Navbar />{children}<Footer /><ChatWidget /></>
}

function NotFound() {
  return <main className="not-found page-container"><span className="not-found-number">404</span><span className="eyebrow">Wrong turn?</span><h1>This page isn't on the shelf.</h1><p>The link may have moved, or this page may not exist.</p><div><Link to="/" className="button button-primary"><HomeIcon size={16} /> Go home</Link><Link to="/browse" className="button button-outline"><ArrowLeft size={16} /> Browse rentals</Link></div></main>
}

function AppRoutes() {
  const location = useLocation()
  const authPage = ['/login', '/register'].includes(location.pathname)
  return <><ScrollManager />{authPage ? <Routes><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /></Routes> : <SiteLayout><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/browse" element={<Browse />} />
    <Route path="/products/:id" element={<ProductDetail />} />
    <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
    <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes></SiteLayout>}<Toaster position="top-right" toastOptions={{ duration: 3500, style: { border: '1px solid #e2e8f0', borderRadius: '14px', fontFamily: 'DM Sans, sans-serif', fontSize: '14px' } }} /></>
}

export default function App() {
  return <AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider>
}
