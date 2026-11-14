import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { BrandMark } from '../components/Shared'

export default function AuthPage({ mode = 'login' }) {
  const [searchParams] = useSearchParams()
  const [view, setView] = useState(searchParams.get('reset') ? 'reset' : mode)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', reset_token: '', new_password: '' })
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [simulationToken, setSimulationToken] = useState('')
  const { setSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = location.state?.from || '/dashboard'
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const finishLogin = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    setSession(data)
    toast.success(`Welcome${data.user.full_name ? ` back, ${data.user.full_name.split(' ')[0]}` : ''}`)
    navigate(data.user.role === 'admin' ? '/admin' : destination, { replace: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (view === 'register') {
        await api.post('/auth/register', { name: form.full_name, email: form.email, phone: form.phone, password: form.password })
        await finishLogin(form.email, form.password)
      } else if (view === 'login') {
        await finishLogin(form.email, form.password)
      } else if (view === 'forgot') {
        const { data } = await api.post('/auth/forgot-password', { email: form.email })
        setSimulationToken(data.reset_token || '')
        setForm((current) => ({ ...current, reset_token: data.reset_token || '' }))
        setView('reset')
        toast.success(data.reset_token ? 'Simulation reset token generated' : data.message)
      } else {
        await api.post('/auth/reset-password', { token: form.reset_token, password: form.new_password })
        toast.success('Password updated. Sign in with your new password.')
        setView('login')
      }
    } catch (error) { toast.error(error.message) }
    finally { setBusy(false) }
  }

  const isLogin = view === 'login'
  const isRegister = view === 'register'
  return <main className="auth-page">
    <section className="auth-visual"><Link to="/" className="brand auth-brand"><BrandMark /><span>sharely<span className="brand-dot">.</span></span></Link><div className="auth-visual-copy"><span className="eyebrow">Make room for more</span><h1>Good things<br />are <em>better shared.</em></h1><p>Find the things you need, meet the people nearby, and make every day a little more resourceful.</p><div className="auth-trust"><ShieldCheck size={18} /><span>Built for sharing. Backed by your community.</span></div></div><div className="auth-art"><span className="auth-art-circle" /><span className="auth-art-box art-box-one" /><span className="auth-art-box art-box-two" /><span className="auth-art-box art-box-three" /><span className="auth-art-spark">✳</span></div><small className="auth-visual-foot">Share more. Waste less. Live a little lighter.</small></section>
    <section className="auth-form-side"><div className="auth-form-wrap">
      <Link to="/" className="auth-back"><ArrowLeft size={16} /> Back to Sharely</Link>
      <div className="auth-heading">{isLogin ? <><span className="eyebrow">Welcome back</span><h2>Good to see you.</h2><p>Sign in to pick up where you left off.</p></> : isRegister ? <><span className="eyebrow">Join the neighborhood</span><h2>Make yourself at home.</h2><p>Create an account and start sharing.</p></> : view === 'forgot' ? <><span className="eyebrow">Account recovery</span><h2>Forgot your password?</h2><p>We'll create a secure reset token for your account.</p></> : <><span className="eyebrow">One more step</span><h2>Choose a new password.</h2><p>Enter your one-time reset token and new password.</p></>}</div>
      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label>Full name<input autoComplete="name" required maxLength={120} value={form.full_name} onChange={update('full_name')} placeholder="Your name" /></label>}
        {(isLogin || isRegister || view === 'forgot') && <label>Email address<span className="auth-input-wrap"><Mail size={16} /><input autoComplete="email" type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" /></span></label>}
        {isRegister && <label>Phone number <span className="optional-label">Optional</span><input autoComplete="tel" maxLength={32} value={form.phone} onChange={update('phone')} placeholder="+91 98765 43210" /></label>}
        {(isLogin || isRegister) && <label>Password<span className="auth-input-wrap"><KeyRound size={16} /><input autoComplete={isLogin ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} minLength={10} required value={form.password} onChange={update('password')} placeholder={isRegister ? 'At least 10 characters' : 'Your password'} /><button type="button" className="password-toggle" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>}
        {view === 'reset' && <><label>One-time reset token<input required value={form.reset_token} onChange={update('reset_token')} placeholder="Paste your reset token" /></label><label>New password<span className="auth-input-wrap"><KeyRound size={16} /><input type={showPassword ? 'text' : 'password'} minLength={10} required value={form.new_password} onChange={update('new_password')} placeholder="At least 10 characters" /></span></label>{simulationToken && <div className="simulation-token"><span>Simulation token</span><code>{simulationToken}</code><small>In production, this token should be delivered through a verified email or SMS provider.</small></div>}</>}
        {isLogin && <div className="auth-inline-row"><span /> <button type="button" className="text-button" onClick={() => setView('forgot')}>Forgot password?</button></div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Sign in' : isRegister ? 'Create account' : view === 'forgot' ? 'Get reset token' : 'Reset password'}<ArrowRight size={17} /></button>
      </form>
      {isLogin && <p className="auth-switch">New to Sharely? <Link to="/register">Create an account</Link></p>}
      {isRegister && <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>}
      {(view === 'forgot' || view === 'reset') && <button className="text-button auth-return" onClick={() => setView('login')}>Back to sign in</button>}
      <p className="auth-terms">By continuing, you agree to Sharely's community guidelines and rental terms.</p>
    </div></section>
  </main>
}
