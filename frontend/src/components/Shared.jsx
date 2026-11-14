import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, Bookmark, Check, ChevronDown, Heart, Menu, MessageCircle, Search, Send, Sparkles, UserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, imageUrl } from '../api'
import { useAuth } from '../context/AuthContext'

const iconMap = {
  Laptop: '⌘', Car: '↗', BookOpen: '▤', Sofa: '▱', PartyPopper: '✳', Dumbbell: '↗',
  Camera: '◉', Headphones: '◖', Gamepad2: '⌗', Projector: '▣', Bike: '↗', Music: '♫',
  GraduationCap: '⌂', Wrench: '⌁', CookingPot: '◍', SprayCan: '✧', Hammer: '⌁',
  Disc3: '◉', Lightbulb: '◌', TentTree: '⌂', Mountain: '⌁', Waves: '≈', Volleyball: '◉', Snowflake: '✳',
}

export function CategoryIcon({ name, className = '' }) {
  return <span className={`category-glyph ${className}`}>{iconMap[name] || '✳'}</span>
}

export function Navbar() {
  const { user, token, logout } = useAuth()
  const [categories, setCategories] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBox = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/admin/categories').then(({ data }) => setCategories(data.items || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) { setNotifications([]); setUnread(0); return undefined }
    let alive = true
    const load = () => api.get('/notifications?per_page=5').then(({ data }) => {
      if (alive) { setNotifications(data.items || []); setUnread(data.unread_count || 0) }
    }).catch(() => {})
    load()
    const timer = window.setInterval(load, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [token])

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return undefined }
    const timer = window.setTimeout(() => {
      api.get('/products', { params: { q: query.trim(), per_page: 5 } })
        .then(({ data }) => setSuggestions(data.items || [])).catch(() => setSuggestions([]))
    }, 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const mainCategories = categories.filter((category) => !category.parent_category)
  const subcategories = (id) => categories.filter((category) => category.parent_category === id)
  const submitSearch = (event) => {
    event.preventDefault()
    const search = new URLSearchParams()
    if (query.trim()) search.set('q', query.trim())
    navigate(`/browse?${search.toString()}`)
    setSearchOpen(false)
  }
  const readNotification = async (notification) => {
    if (!notification.is_read) {
      try {
        await api.put(`/notifications/${notification.id}/read`)
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
        setUnread((count) => Math.max(0, count - 1))
      } catch (error) { toast.error(error.message) }
    }
  }

  return <header className="site-header">
    <div className="nav-shell">
      <button className="mobile-menu-icon icon-button" aria-label="Open menu" onClick={() => setMobileOpen((open) => !open)}><Menu size={21} /></button>
      <Link to="/" className="brand"><span className="brand-mark"><Bookmark size={17} fill="currentColor" /></span><span>sharely<span className="brand-dot">.</span></span></Link>
      <div className={`desktop-nav ${mobileOpen ? 'mobile-show' : ''}`}>
        <div className="category-nav-wrap">
          <button className={`nav-link category-menu-trigger ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen((open) => !open)}>
            Explore <ChevronDown size={15} />
          </button>
          {menuOpen && <div className="mega-menu">
            <div className="mega-heading"><div><span className="eyebrow">Browse by category</span><h3>Find what you need</h3></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close categories"><X size={17} /></button></div>
            <div className="mega-grid">{mainCategories.map((category) => <div className="mega-category" key={category.id}>
              <Link to={`/browse?category=${category.id}`} onClick={() => setMenuOpen(false)} className="mega-title"><CategoryIcon name={category.icon_name} />{category.name}</Link>
              {subcategories(category.id).slice(0, 5).map((sub) => <Link key={sub.id} to={`/browse?category=${category.id}&subcategory=${sub.id}`} onClick={() => setMenuOpen(false)}>{sub.name}</Link>)}
            </div>)}</div>
          </div>}
        </div>
        <NavLink to="/browse" className="nav-link">Browse rentals</NavLink>
      </div>
      <form className="nav-search" onSubmit={submitSearch} ref={searchBox}>
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSearchOpen(true)} placeholder="Search items, gear, and more" aria-label="Search rentals" />
        {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
        <button className="search-submit" aria-label="Submit search"><ArrowRight size={16} /></button>
        {searchOpen && suggestions.length > 0 && <div className="search-suggestions">
          {suggestions.map((item) => <Link key={item.id} to={`/products/${item.id}`} onClick={() => { setSearchOpen(false); setQuery('') }} className="suggestion-row">
            <span className="suggestion-image">{item.images?.[0] ? <img src={imageUrl(item.images[0].image_url)} alt="" /> : <Search size={15} />}</span>
            <span><strong>{item.title}</strong><small>{item.location} · ₹{Number(item.price_per_day).toLocaleString('en-IN')}/day</small></span>
            <ArrowRight size={15} />
          </Link>)}
          <button type="button" className="suggestion-all" onClick={submitSearch}>See all results for “{query}” <ArrowRight size={14} /></button>
        </div>}
      </form>
      <div className="nav-actions">
        {token && <div className="notification-wrap">
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationOpen((open) => !open)}><Bell size={19} />{unread > 0 && <span className="unread-badge">{unread > 9 ? '9+' : unread}</span>}</button>
          {notificationOpen && <div className="notification-popover">
            <div className="popover-head"><div><strong>Notifications</strong><small>{unread ? `${unread} unread` : 'You are all caught up'}</small></div>{unread > 0 && <button onClick={async () => { try { await api.post('/notifications/read-all'); setNotifications((items) => items.map((item) => ({ ...item, is_read: true }))); setUnread(0) } catch (error) { toast.error(error.message) } }}>Mark all read</button>}</div>
            {notifications.length === 0 ? <div className="empty-mini">No notifications yet.</div> : notifications.map((item) => <button key={item.id} className={`notification-item ${!item.is_read ? 'unread' : ''}`} onClick={() => readNotification(item)}><span className="notification-dot" /><span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.created_at).toLocaleDateString()}</time></span></button>)}
            <Link to="/dashboard" className="popover-footer" onClick={() => setNotificationOpen(false)}>Open dashboard <ArrowRight size={14} /></Link>
          </div>}
        </div>}
        {user ? <div className="user-nav"><Link to={user.role === 'admin' ? '/admin' : '/dashboard'} className="avatar-link" title="Dashboard"><span className="avatar-small">{user.full_name?.slice(0, 1)?.toUpperCase() || <UserRound size={16} />}</span><span className="nav-user-name">{user.full_name?.split(' ')[0]}</span></Link><button className="logout-link" onClick={() => { logout(); toast.success('Signed out') }}>Sign out</button></div>
          : <><Link to="/login" className="nav-signin">Log in</Link><Link to="/register" className="button button-primary button-small">Get started</Link></>}
      </div>
    </div>
    {searchOpen && <button className="click-away" aria-label="Close search suggestions" onClick={() => setSearchOpen(false)} />}
  </header>
}

export function ProductCard({ product, compact = false }) {
  const { user, savedIds, toggleSaved } = useAuth()
  const [saving, setSaving] = useState(false)
  const image = product.images?.find((item) => item.is_primary)?.image_url || product.images?.[0]?.image_url
  const save = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!user) { toast('Sign in to save this rental'); return }
    setSaving(true)
    try { const nowSaved = await toggleSaved(product.id); toast.success(nowSaved ? 'Saved to your list' : 'Removed from saved') }
    catch (error) { toast.error(error.message) } finally { setSaving(false) }
  }
  return <article className={`product-card ${compact ? 'product-card-compact' : ''}`}>
    <Link to={`/products/${product.id}`} className="product-card-link">
      <div className="product-image-wrap">{image ? <img src={imageUrl(image)} alt={product.title} loading="lazy" /> : <div className="image-placeholder"><Sparkles size={26} /><span>Ready to be shared</span></div>}
        <span className="condition-chip">{product.condition_status}</span>
      </div>
      <div className="product-card-body">
        <div className="product-card-location"><span>{product.location}</span><span className="product-rating">Available</span></div>
        <h3>{product.title}</h3>
        <div className="product-price"><strong>₹{Number(product.price_per_day).toLocaleString('en-IN')}</strong><span> / day</span><i>·</i><span>₹{Number(product.security_deposit).toLocaleString('en-IN')} deposit</span></div>
      </div>
    </Link>
    <button className={`save-button ${savedIds.includes(product.id) ? 'saved' : ''}`} aria-label={savedIds.includes(product.id) ? 'Remove from saved' : 'Save rental'} disabled={saving} onClick={save}><Heart size={18} fill={savedIds.includes(product.id) ? 'currentColor' : 'none'} /></button>
  </article>
}

export function ProductGrid({ products = [], loading = false, emptyTitle = 'No rentals found', emptyText = 'Try adjusting your filters or search for something else.' }) {
  if (loading) return <div className="product-grid">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index}><div className="skeleton skeleton-image" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>)}</div>
  if (!products.length) return <div className="empty-state"><span className="empty-icon"><Search size={23} /></span><h3>{emptyTitle}</h3><p>{emptyText}</p><Link to="/browse" className="button button-outline">Explore all rentals</Link></div>
  return <div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div>
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  useEffect(() => { if (open) scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])
  useEffect(() => {
    const openChat = () => setOpen(true)
    window.addEventListener('srsp:open-chat', openChat)
    return () => window.removeEventListener('srsp:open-chat', openChat)
  }, [])
  const send = async (event) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setMessages((items) => [...items, { role: 'user', text }])
    setMessage('')
    setSending(true)
    try {
      const { data } = await api.post('/ai/chat', { message: text })
      setMessages((items) => [...items, { role: 'assistant', text: data.answer, products: data.products || [] }])
    } catch (error) { setMessages((items) => [...items, { role: 'assistant', text: error.message }]) }
    finally { setSending(false) }
  }
  return <>
    {open && <section className="chat-panel" aria-label="Sharely AI assistant">
      <div className="chat-head"><span className="chat-avatar"><Sparkles size={17} /></span><div><strong>Sharely assistant</strong><small><span className="online-dot" /> Here to help</small></div><button className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="chat-messages">
        {messages.length === 0 && <div className="chat-welcome"><span className="chat-welcome-icon"><Sparkles size={21} /></span><strong>Hi{', there'} 👋</strong><p>Ask me about available rentals, booking steps, deposits, or your current booking.</p><div className="chat-prompts">{['How does the deposit work?', 'Show cameras to rent'].map((prompt) => <button key={prompt} onClick={() => setMessage(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map((item, index) => <div className={`chat-message ${item.role}`} key={index}><div className="chat-bubble">{item.text}{item.products?.slice(0, 3).map((product) => <Link to={`/products/${product.id}`} onClick={() => setOpen(false)} className="chat-product" key={product.id}><strong>{product.title}</strong><span>₹{Number(product.price_per_day).toLocaleString('en-IN')} / day · {product.location}</span></Link>)}</div></div>)}
        {sending && <div className="chat-message assistant"><div className="chat-bubble typing-dots"><i /><i /><i /></div></div>}<div ref={scrollRef} />
      </div>
      <form className="chat-input-row" onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask anything about renting…" aria-label="Message assistant" /><button className="button button-primary send-button" disabled={sending || !message.trim()} aria-label="Send message"><Send size={16} /></button></form>
      <div className="chat-footnote">Answers use current listings and platform policies.</div>
    </section>}
    <button className={`chat-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close chat' : 'Open AI assistant'}>{open ? <X size={21} /> : <><MessageCircle size={21} /><span>Ask Sharely</span><Sparkles size={14} /></>}</button>
  </>
}

export function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

export function StatusPill({ status }) {
  const kind = String(status || '').toLowerCase().replaceAll(' ', '-')
  return <span className={`status-pill status-${kind}`}>{status}</span>
}

export function InlineLoader({ label = 'Loading…' }) { return <div className="inline-loader"><span className="spinner" />{label}</div> }

export function Modal({ title, subtitle, onClose, children, size = '' }) {
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal-card ${size}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>{children}
  </section></div>
}

export function PageLoader() { return <div className="page-loader"><span className="spinner spinner-large" /><span>Loading Sharely…</span></div> }

export function BrandMark() { return <span className="brand-mark"><Bookmark size={17} fill="currentColor" /></span> }
