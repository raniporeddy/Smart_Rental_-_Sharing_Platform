import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ArrowDownToLine, ArrowRight, BadgeCheck, BellRing, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, FileText, Heart, History, LayoutDashboard, ListPlus, LoaderCircle, LogOut, Package, PackageCheck, Pencil, Plus, RotateCcw, ShieldCheck, Star, Trash2, TrendingUp, UserRound, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, imageUrl, localDateISO } from '../api'
import { useAuth } from '../context/AuthContext'
import { CategoryIcon, Modal, ProductGrid, SectionHeading, StatusPill } from '../components/Shared'
import CheckoutModal from '../components/CheckoutModal'

const TABS = [
  { id: 'bookings', label: 'My bookings', group: 'Renting', icon: CalendarDays },
  { id: 'payments', label: 'Payment history', group: 'Renting', icon: Wallet },
  { id: 'history', label: 'Rental history', group: 'Renting', icon: History },
  { id: 'saved', label: 'Saved rentals', group: 'Renting', icon: Heart },
  { id: 'profile', label: 'Profile settings', group: 'Account', icon: UserRound },
  { id: 'listings', label: 'My listings', group: 'Sharing', icon: Package },
  { id: 'requests', label: 'Booking requests', group: 'Sharing', icon: BellRing },
  { id: 'active', label: 'Active rentals', group: 'Sharing', icon: Activity },
  { id: 'earnings', label: 'Earnings', group: 'Sharing', icon: CircleDollarSign },
]

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const date = (value) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Dashboard() {
  const { user, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTab = searchParams.get('tab') || 'bookings'
  const [bookings, setBookings] = useState([])
  const [payments, setPayments] = useState([])
  const [history, setHistory] = useState([])
  const [listings, setListings] = useState([])
  const [saved, setSaved] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [categories, setCategories] = useState([])
  const [profile, setProfile] = useState(user || {})
  const [loading, setLoading] = useState(true)
  const [paymentBooking, setPaymentBooking] = useState(null)
  const [reviewBooking, setReviewBooking] = useState(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [productModal, setProductModal] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      api.get('/bookings?side=all'), api.get('/payments/history?side=renter'),
      api.get('/payments/history?side=owner'), api.get('/bookings/history?side=renter'),
      api.get('/bookings/history?side=owner'), api.get('/products/mine'),
      api.get('/users/me/saved-products'), api.get('/payments/earnings'), api.get('/admin/categories'),
    ])
    const value = (index) => results[index].status === 'fulfilled' ? results[index].value.data : null
    setBookings(value(0)?.items || [])
    setPayments([...(value(1)?.items || []), ...(value(2)?.items || [])].sort((a, b) => (b.id || 0) - (a.id || 0)))
    setHistory([...(value(3)?.items || []), ...(value(4)?.items || [])])
    setListings(value(5)?.items || [])
    setSaved(value(6)?.items || [])
    setEarnings(value(7))
    setCategories(value(8)?.items || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadDashboard(); refreshProfile().then((current) => current && setProfile(current)).catch(() => {}) }, [loadDashboard, refreshProfile])
  const chooseTab = (tab) => setSearchParams({ tab })
  const renterBookings = useMemo(() => bookings.filter((item) => item.renter_id === user?.id), [bookings, user?.id])
  const incomingBookings = useMemo(() => bookings.filter((item) => item.owner_id === user?.id), [bookings, user?.id])
  const activeRentals = incomingBookings.filter((item) => item.status === 'Active')
  const requests = incomingBookings.filter((item) => ['Pending', 'Approved', 'Confirmed'].includes(item.status))
  const requestCount = requests.length
  const tabTitle = TABS.find((tab) => tab.id === selectedTab)?.label || 'My bookings'

  const respond = async (bookingId, action) => {
    setBusyId(bookingId)
    try { await api.put(`/bookings/${bookingId}/respond`, { action }); toast.success(action === 'approve' ? 'Booking approved' : 'Request declined'); await loadDashboard() }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const cancelBooking = async (bookingId) => {
    setBusyId(bookingId)
    try { await api.put(`/bookings/${bookingId}/cancel`); toast.success('Booking cancelled'); await loadDashboard() }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const markReturned = async (bookingId) => {
    setBusyId(bookingId)
    try { await api.put(`/bookings/${bookingId}/return`, { actual_return_date: localDateISO() }); toast.success('Return recorded'); await loadDashboard() }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const recordHandover = async (bookingId) => {
    setBusyId(bookingId)
    try { await api.put(`/bookings/${bookingId}/handover`); toast.success('Handover recorded. Rental is active.'); await loadDashboard() }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const removeListing = async (productId) => {
    if (!window.confirm('Remove this listing from the marketplace?')) return
    setBusyId(productId)
    try { await api.delete(`/products/${productId}`); toast.success('Listing removed'); await loadDashboard() }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const toggleAvailability = async (product) => {
    setBusyId(product.id)
    try {
      const { data } = await api.put(`/products/${product.id}`, { is_available: !product.is_available })
      setListings((items) => items.map((item) => item.id === product.id ? data.product : item))
      toast.success(data.product.is_available ? 'Listing is available' : 'Listing paused')
    } catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const submitReview = async (event) => {
    event.preventDefault()
    setBusyId(reviewBooking.id)
    try {
      await api.post('/reviews', { booking_id: reviewBooking.id, rating: reviewRating, comment: reviewComment })
      toast.success('Review submitted')
      setReviewBooking(null)
      setReviewComment('')
    } catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const saveProfile = async (event) => {
    event.preventDefault()
    setBusyId('profile')
    try {
      const { data } = await api.put('/auth/profile', { full_name: profile.full_name, phone: profile.phone, location: profile.location, avatar_url: profile.avatar_url })
      setProfile(data.user)
      await refreshProfile()
      toast.success('Profile updated')
    } catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }

  return <main className="dashboard-page page-container">
    <div className="dashboard-welcome"><div><span className="eyebrow">Your Sharely space</span><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.full_name?.split(' ')[0]}.</h1><p>Keep your rentals, listings, and plans all in one place.</p></div><button className="button button-primary" onClick={() => setProductModal({ mode: 'create' })}><Plus size={17} /> List an item</button></div>
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar"><div className="dashboard-user-card"><span className="dashboard-avatar">{user?.full_name?.slice(0, 1)?.toUpperCase()}</span><div><strong>{user?.full_name}</strong><small>{user?.email}</small></div></div>
        {['Renting', 'Sharing', 'Account'].map((group) => <div className="dashboard-nav-group" key={group}><span className="dashboard-nav-label">{group}</span>{TABS.filter((tab) => tab.group === group).map((tab) => { const Icon = tab.icon; return <button key={tab.id} className={`dashboard-nav-item ${selectedTab === tab.id ? 'active' : ''}`} onClick={() => chooseTab(tab.id)}><Icon size={17} /><span>{tab.label}</span>{tab.id === 'requests' && requestCount > 0 && <i>{requestCount}</i>}</button> })}</div>)}
        <div className="dashboard-sidebar-foot"><ShieldCheck size={15} /><span>One account, both sides of sharing.</span></div>
      </aside>
      <section className="dashboard-content"><div className="dashboard-content-head"><div><h2>{tabTitle}</h2><p>{selectedTab === 'bookings' ? 'Track your requests and upcoming rentals.' : selectedTab === 'listings' ? 'Manage the things you share with your community.' : 'Your activity, kept up to date.'}</p></div>{selectedTab === 'listings' && <button className="button button-primary button-small" onClick={() => setProductModal({ mode: 'create' })}><Plus size={15} /> Add new item</button>}</div>
        {loading ? <DashboardLoading /> : <>
          {selectedTab === 'bookings' && <BookingsView rows={renterBookings} onPay={setPaymentBooking} onCancel={cancelBooking} onReview={setReviewBooking} busyId={busyId} />}
          {selectedTab === 'payments' && <PaymentsView rows={payments.filter((item) => item.booking_status !== 'Pending')} />}
          {selectedTab === 'history' && <HistoryView rows={history} />}
          {selectedTab === 'saved' && <ProductGrid products={saved} emptyTitle="Nothing saved yet" emptyText="Tap the heart on a rental to keep it close by." />}
          {selectedTab === 'profile' && <form className="profile-settings" onSubmit={saveProfile}><div className="profile-section-title"><span className="profile-big-avatar">{profile.full_name?.slice(0, 1)?.toUpperCase()}</span><div><strong>Your profile</strong><small>Manage the details other members can use to identify you.</small></div></div><label>Full name<input required maxLength={120} value={profile.full_name || ''} onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))} /></label><label>Email address<input value={profile.email || ''} disabled /></label><label>Phone number<input maxLength={32} value={profile.phone || ''} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></label><label>Location<input value={profile.location || ''} onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))} placeholder="City or neighborhood" /></label><label>Avatar image URL<input type="url" value={profile.avatar_url || ''} onChange={(event) => setProfile((current) => ({ ...current, avatar_url: event.target.value }))} placeholder="https://…" /></label><button className="button button-primary" disabled={busyId === 'profile'}>{busyId === 'profile' ? 'Saving…' : 'Save profile'}</button></form>}
          {selectedTab === 'listings' && <ListingsView rows={listings} onAdd={() => setProductModal({ mode: 'create' })} onEdit={(item) => setProductModal({ mode: 'edit', product: item })} onToggle={toggleAvailability} onRemove={removeListing} busyId={busyId} />}
          {selectedTab === 'requests' && <RequestsView rows={requests} onRespond={respond} onHandover={recordHandover} busyId={busyId} />}
          {selectedTab === 'active' && <ActiveRentalsView rows={activeRentals} onReturn={markReturned} busyId={busyId} />}
          {selectedTab === 'earnings' && <EarningsView earnings={earnings} rows={payments.filter((item) => item.payment_status === 'Verified' && item.booking_status !== 'Pending')} />}
        </>}
      </section>
    </div>
    {paymentBooking && <CheckoutModal booking={paymentBooking} onClose={() => setPaymentBooking(null)} onVerified={() => loadDashboard()} />}
    {reviewBooking && <Modal title="Review this rental" subtitle={reviewBooking.product_title || `Booking #${reviewBooking.id}`} onClose={() => setReviewBooking(null)}><form className="review-form" onSubmit={submitReview}><div className="rating-picker" aria-label={`Selected ${reviewRating} stars`}>{Array.from({ length: 5 }, (_, index) => <button type="button" key={index} onClick={() => setReviewRating(index + 1)} aria-label={`${index + 1} stars`}><Star size={26} fill={index < reviewRating ? 'currentColor' : 'none'} /></button>)}</div><label>Your review<textarea rows={4} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="How did the rental go?" /></label><button className="button button-primary" disabled={busyId === reviewBooking.id}>Submit review</button></form></Modal>}
    {productModal && <ProductFormModal mode={productModal.mode} product={productModal.product} categories={categories} onClose={() => setProductModal(null)} onSaved={loadDashboard} />}
  </main>
}

function DashboardLoading() { return <div className="dashboard-skeletons"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-card" /></div> }

function EmptyPanel({ icon: Icon = PackageCheck, title, text, action }) { return <div className="empty-panel"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p>{action}</div> }

function BookingsView({ rows, onPay, onCancel, onReview, busyId }) {
  if (!rows.length) return <EmptyPanel icon={CalendarDays} title="Your next rental is waiting" text="Search the marketplace and send a booking request when you find the right thing." action={<Link to="/browse" className="button button-primary">Browse rentals <ArrowRight size={15} /></Link>} />
  return <div className="booking-list">{rows.map((booking) => <article className="booking-card" key={booking.id}><div className="booking-card-main"><div className="booking-item-icon"><Package size={19} /></div><div className="booking-title"><span className="eyebrow">Booking #{booking.id}</span><h3>{booking.product_title || `Rental #${booking.product_id}`}</h3><p><CalendarDays size={14} />{date(booking.start_date)} – {date(booking.return_date)} <i>·</i> {booking.total_days} {booking.total_days === 1 ? 'day' : 'days'}</p></div><StatusPill status={booking.status} /></div>
    <div className="booking-card-bottom"><div className="booking-status-track">{['Pending', 'Approved', 'Confirmed', 'Active', 'Returned'].map((step, index) => { const activeIndex = ['Pending', 'Approved', 'Confirmed', 'Active', 'Returned', 'Completed'].indexOf(booking.status); return <span className={index <= activeIndex ? 'reached' : ''} key={step}><i>{index < activeIndex ? <Check size={10} /> : index + 1}</i><small>{step}</small></span> })}</div><div className="booking-actions">{booking.status === 'Approved' && <button className="button button-primary button-small" onClick={() => onPay(booking)}>Pay now <ArrowRight size={14} /></button>}{['Pending', 'Approved'].includes(booking.status) && <button className="button button-quiet button-small" disabled={busyId === booking.id} onClick={() => onCancel(booking.id)}>Cancel</button>}{['Returned', 'Completed'].includes(booking.status) && <button className="button button-outline button-small" onClick={() => onReview(booking)}>Submit review <Star size={14} /></button>}<strong className="booking-total-small">{money(booking.total_payable)}</strong></div></div>
  </article>)}</div>
}

function PaymentsView({ rows }) {
  if (!rows.length) return <EmptyPanel icon={Wallet} title="No payments yet" text="Verified payment transactions will show here after an owner approves your booking." />
  return <div className="table-card"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Transaction</th><th>Booking</th><th>Method</th><th>Paid</th><th>Rental / deposit</th><th>Status</th><th>Date</th></tr></thead><tbody>{rows.map((payment) => <tr key={payment.id}><td><code>{payment.transaction_id || `Payment ${payment.id}`}</code></td><td>#{payment.booking_id}</td><td>{payment.payment_method}</td><td>{money(payment.total_paid)}</td><td>{money(payment.rental_paid)} / {money(payment.deposit_paid)}</td><td><StatusPill status={payment.payment_status} /></td><td>{payment.paid_at ? date(payment.paid_at) : '—'}</td></tr>)}</tbody></table></div></div>
}

function HistoryView({ rows }) {
  if (!rows.length) return <EmptyPanel icon={History} title="Your rental history starts here" text="Completed rentals and their return records will be listed here." />
  return <div className="history-list">{rows.map((item) => <article key={`${item.booking_id}-${item.side}`} className="history-row"><span className="history-icon"><RotateCcw size={17} /></span><div className="history-row-main"><strong>{item.product_title}</strong><small>Booking #{item.booking_id} · {item.side === 'renter' ? 'Rented by you' : 'Shared by you'}</small></div><div className="history-return"><span>{date(item.completed_at)}</span><small>{item.late_days ? `${item.late_days} late day${item.late_days > 1 ? 's' : ''} · ${money(item.penalty_amount)} penalty` : 'Returned on time'}</small></div></article>)}</div>
}

function ListingsView({ rows, onAdd, onEdit, onToggle, onRemove, busyId }) {
  if (!rows.length) return <EmptyPanel icon={Package} title="Your shelf is still empty" text="List a useful item and let your neighbors put it to good use." action={<button className="button button-primary" onClick={onAdd}><Plus size={15} /> Add a listing</button>} />
  return <div className="owner-listing-list">{rows.map((item) => { const photo = item.images?.[0]?.image_url; return <article className="owner-listing-card" key={item.id}><div className="owner-listing-photo">{photo ? <img src={imageUrl(photo)} alt="" /> : <Package size={21} />}</div><div className="owner-listing-info"><div className="owner-listing-title"><h3>{item.title}</h3><span className={`listing-moderation ${item.is_flagged_fraud ? 'flagged' : item.is_approved ? 'approved' : 'pending'}`}>{item.is_flagged_fraud ? 'AI flag for review' : item.is_approved ? 'Approved' : 'Pending approval'}</span></div><p>{item.location} · {item.condition_status}</p><div className="owner-listing-price">{money(item.price_per_day)} <small>/ day</small><i>·</i> {money(item.security_deposit)} <small>deposit</small></div>{item.fraud_reason && <small className="fraud-explanation"><ShieldCheck size={13} />{item.fraud_reason}</small>}</div><div className="owner-listing-actions"><button className={`toggle-availability ${item.is_available ? 'on' : ''}`} onClick={() => onToggle(item)} disabled={busyId === item.id} aria-label={item.is_available ? 'Pause listing' : 'Make listing available'}><i /></button><span>{item.is_available ? 'Live' : 'Paused'}</span><button className="icon-button" onClick={() => onEdit(item)} aria-label="Edit listing"><Pencil size={16} /></button><button className="icon-button danger-icon" onClick={() => onRemove(item.id)} aria-label="Remove listing" disabled={busyId === item.id}><Trash2 size={16} /></button></div></article> })}</div>
}

function RequestsView({ rows, onRespond, onHandover, busyId }) {
  if (!rows.length) return <EmptyPanel icon={BellRing} title="No new booking requests" text="When someone requests one of your listings, it will be ready for your review here." />
  return <div className="request-list">{rows.map((booking) => <article className="request-card" key={booking.id}><div className="request-top"><span className="request-icon"><CalendarDays size={18} /></span><div><span className="eyebrow">Request #{booking.id}</span><h3>{booking.product_title || `Listing #${booking.product_id}`}</h3></div><StatusPill status={booking.status} /></div><div className="request-details"><span><CalendarDays size={14} />{date(booking.start_date)} – {date(booking.return_date)} ({booking.total_days} days)</span><strong>{money(booking.total_payable)} <small>incl. deposit</small></strong></div>{booking.is_suspicious && <div className="fraud-explanation"><ShieldCheck size={14} />{booking.suspicion_reason || 'This request was flagged for admin review.'}</div>}{booking.status === 'Pending' ? <div className="request-actions"><button className="button button-outline" disabled={busyId === booking.id} onClick={() => onRespond(booking.id, 'reject')}>Decline</button><button className="button button-primary" disabled={busyId === booking.id} onClick={() => onRespond(booking.id, 'approve')}>{busyId === booking.id ? 'Saving…' : 'Accept request'}<Check size={15} /></button></div> : booking.status === 'Approved' ? <div className="request-next-step"><Clock3 size={15} />Waiting for the renter to complete payment.</div> : <div className="request-actions"><span className="request-next-step"><BadgeCheck size={15} />Payment verified. Ready for handover.</span><button className="button button-primary" disabled={busyId === booking.id} onClick={() => onHandover(booking.id)}>Record item handover <PackageCheck size={15} /></button></div>}</article>)}</div>
}

function ActiveRentalsView({ rows, onReturn, busyId }) {
  if (!rows.length) return <EmptyPanel icon={Activity} title="No active rentals" text="Once a renter pays and you record handover, the rental will appear here." />
  return <div className="booking-list">{rows.map((booking) => <article className="active-rental-card" key={booking.id}><div className="active-rental-head"><span className="active-rental-mark"><Activity size={18} /></span><div><span className="eyebrow">Booking #{booking.id}</span><h3>{booking.product_title}</h3><p>Due back {date(booking.return_date)}</p></div><StatusPill status={booking.status} /></div><div className="active-rental-footer"><span>{date(booking.start_date)} – {date(booking.return_date)} · {booking.total_days} days</span><button className="button button-primary button-small" disabled={busyId === booking.id} onClick={() => onReturn(booking.id)}>{busyId === booking.id ? 'Recording…' : 'Confirm item returned'}<PackageCheck size={15} /></button></div></article>)}</div>
}

function EarningsView({ earnings, rows }) {
  if (!earnings) return <EmptyPanel icon={CircleDollarSign} title="Earnings are loading" text="Verified payments and rental activity will appear here." />
  return <><div className="earnings-cards"><div className="earnings-card earnings-primary"><span className="earnings-icon"><TrendingUp size={18} /></span><small>Verified rental earnings</small><strong>{money(earnings.verified_rental_earnings)}</strong><span>Rental charges only; deposits are separate.</span></div><div className="earnings-card"><span className="earnings-icon violet"><ShieldCheck size={18} /></span><small>Deposits held</small><strong>{money(earnings.deposits_held)}</strong><span>Refundable deposits collected for rentals.</span></div><div className="earnings-card"><span className="earnings-icon mint"><Activity size={18} /></span><small>Active rentals</small><strong>{earnings.active_rentals}</strong><span>Items currently in use.</span></div><div className="earnings-card"><span className="earnings-icon gold"><PackageCheck size={18} /></span><small>Completed rentals</small><strong>{earnings.completed_rentals}</strong><span>Returns recorded in rental history.</span></div></div>
    <div className="earnings-detail-head"><div><h3>Recent verified payments</h3><p>Deposits are shown separately from rental earnings.</p></div></div>{rows.length ? <PaymentsView rows={rows} /> : <EmptyPanel icon={Wallet} title="No verified payments yet" text="When a renter completes payment, the rental amount will appear here." />}</>
}

function ProductFormModal({ mode, product, categories, onClose, onSaved }) {
  const currentCategory = categories.find((item) => item.id === product?.category_id)
  const initialParentId = currentCategory?.parent_category || currentCategory?.id || ''
  const initialSubcategoryId = currentCategory?.parent_category ? currentCategory.id : ''
  const [values, setValues] = useState(() => ({ title: product?.title || '', description: product?.description || '', category_id: initialParentId, subcategory_id: initialSubcategoryId, price_per_day: product?.price_per_day || '', security_deposit: product?.security_deposit || '', estimated_retail_value: '', location: product?.location || '', condition_status: product?.condition_status || 'Good', available_from: product?.available_from || '', available_to: product?.available_to || '' }))
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const category = categories.find((item) => item.id === Number(values.category_id))
  const mainCategories = categories.filter((item) => !item.parent_category)
  const subcategories = categories.filter((item) => item.parent_category === Number(values.category_id))
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }))

  const autoDetect = async () => {
    if (!files[0]) return toast.error('Choose a product photo first')
    setAiLoading(true)
    try {
      const body = new FormData()
      body.append('image', files[0])
      const { data } = await api.post('/ai/classify-image', body)
      const found = categories.find((item) => item.id === data.category_id)
      const parent = found?.parent_category ? categories.find((item) => item.id === found.parent_category) : found
      setAiMessage(data.message || `Suggested ${data.subcategory || data.category || 'category'} (${Math.round((data.confidence || 0) * 100)}% match).`)
      if (found && parent) setValues((current) => ({ ...current, category_id: String(parent.id), subcategory_id: found.parent_category ? String(found.id) : '' }))
      else toast('No confident category match. Choose one manually.')
    } catch (error) { toast.error(error.message) } finally { setAiLoading(false) }
  }
  const suggestPrice = async () => {
    if (!values.category_id || !values.estimated_retail_value) return toast.error('Select a category and enter the estimated retail value')
    setAiLoading(true)
    try {
      const { data } = await api.post('/ai/predict-price', { category_id: Number(values.category_id), subcategory_id: values.subcategory_id ? Number(values.subcategory_id) : undefined, condition_status: values.condition_status, estimated_retail_value: Number(values.estimated_retail_value) })
      setValues((current) => ({ ...current, price_per_day: data.recommended_daily_price, security_deposit: data.recommended_deposit }))
      setAiMessage(`Suggested ₹${Number(data.recommended_daily_price).toLocaleString('en-IN')} per day · range ₹${Number(data.min_range).toLocaleString('en-IN')}–₹${Number(data.max_range).toLocaleString('en-IN')}`)
      toast.success('AI pricing suggestion added')
    } catch (error) { toast.error(error.message) } finally { setAiLoading(false) }
  }
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === 'edit') {
        const body = { title: values.title, description: values.description, category_id: Number(values.subcategory_id || values.category_id), price_per_day: Number(values.price_per_day), security_deposit: Number(values.security_deposit), location: values.location, condition_status: values.condition_status, available_from: values.available_from || null, available_to: values.available_to || null }
        await api.put(`/products/${product.id}`, body)
      } else {
        const body = new FormData()
        Object.entries({ title: values.title, description: values.description, category_id: values.subcategory_id || values.category_id, price_per_day: values.price_per_day, security_deposit: values.security_deposit || '0', location: values.location, condition_status: values.condition_status, available_from: values.available_from, available_to: values.available_to }).forEach(([key, value]) => { if (value !== '') body.append(key, value) })
        files.forEach((file) => body.append('images', file))
        await api.post('/products', body)
      }
      toast.success(mode === 'edit' ? 'Listing updated and sent for approval' : 'Listing submitted for review')
      await onSaved()
      onClose()
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }
  return <Modal title={mode === 'edit' ? 'Edit your listing' : 'List a new item'} subtitle={mode === 'edit' ? 'Changes to listing details need admin re-approval.' : 'A few details help neighbors find the right thing.'} onClose={onClose} size="listing-modal"><form className="listing-form" onSubmit={submit}>
    <div className="listing-form-grid"><label>Item title<input required maxLength={180} value={values.title} onChange={update('title')} placeholder="e.g. Mirrorless camera kit" /></label><label>Location<input required maxLength={180} value={values.location} onChange={update('location')} placeholder="City or neighborhood" /></label>
      <label>Category<select required value={values.category_id} onChange={(event) => setValues((current) => ({ ...current, category_id: event.target.value, subcategory_id: '' }))}><option value="">Choose a category</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subcategory<select value={values.subcategory_id} onChange={update('subcategory_id')} disabled={!subcategories.length}><option value="">{subcategories.length ? 'Choose a subcategory' : 'Select a category first'}</option>{subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Condition<select value={values.condition_status} onChange={update('condition_status')}><option>New</option><option>Like New</option><option>Good</option><option>Fair</option></select></label><label>Estimated retail value <span className="optional-label">For AI pricing</span><input type="number" min="1" value={values.estimated_retail_value} onChange={update('estimated_retail_value')} placeholder="₹ e.g. 45000" /></label>
      <label>Price per day<input required type="number" min="1" step="0.01" value={values.price_per_day} onChange={update('price_per_day')} placeholder="₹" /></label><label>Security deposit<input type="number" min="0" step="0.01" value={values.security_deposit} onChange={update('security_deposit')} placeholder="₹" /></label>
      <label>Available from <span className="optional-label">Optional</span><input type="date" value={values.available_from} onChange={update('available_from')} /></label><label>Available until <span className="optional-label">Optional</span><input type="date" value={values.available_to} onChange={update('available_to')} /></label>
    </div>
    <label>Description<textarea required rows={4} value={values.description} onChange={update('description')} placeholder="Describe what is included and anything renters should know." /></label>
    {mode === 'create' && <div className="listing-photo-field"><label>Photos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label><div className="listing-ai-actions"><button type="button" className="button button-outline button-small" disabled={aiLoading} onClick={autoDetect}><SparklesIcon />{aiLoading ? 'Analyzing…' : 'Auto-detect category'}</button><button type="button" className="button button-outline button-small" disabled={aiLoading} onClick={suggestPrice}><TrendingUp size={14} />AI suggest price</button></div>{files.length > 0 && <small>{files.length} photo{files.length === 1 ? '' : 's'} selected · {files[0].name}</small>}{aiMessage && <small className="ai-inline-message">{aiMessage}</small>}</div>}
    {mode === 'edit' && <div className="listing-ai-actions"><button type="button" className="button button-outline button-small" disabled={aiLoading} onClick={suggestPrice}><TrendingUp size={14} />AI suggest price</button>{aiMessage && <small className="ai-inline-message">{aiMessage}</small>}</div>}
    <div className="listing-submit-row"><span><ShieldCheck size={15} /> New or edited listings are reviewed before appearing in browse.</span><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Submit listing'}<ArrowRight size={15} /></button></div>
  </form></Modal>
}

function SparklesIcon() { return <span className="sparkle-small">✧</span> }
