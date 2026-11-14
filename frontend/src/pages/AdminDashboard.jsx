import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BarChart3, Ban, CalendarDays, Check, ChevronDown, CircleDollarSign, FileText, FolderTree, LayoutDashboard, Package, Plus, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import { api, imageUrl } from '../api'
import { CategoryIcon, InlineLoader, SectionHeading, StatusPill } from '../components/Shared'

const MONEY = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const COLORS = ['#2563eb', '#7c3aed', '#0f766e', '#f59e0b', '#f97316', '#db2777', '#64748b']

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [analytics, setAnalytics] = useState({ monthly_revenue: [], category_distribution: [] })
  const [users, setUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [products, setProducts] = useState([])
  const [bookings, setBookings] = useState([])
  const [suspicious, setSuspicious] = useState([])
  const [complaints, setComplaints] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [categoryParent, setCategoryParent] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      api.get('/admin/stats'), api.get('/admin/analytics'), api.get('/admin/users?per_page=100'),
      api.get('/admin/products'), api.get('/admin/bookings'), api.get('/admin/suspicious-bookings'),
      api.get('/admin/complaints'), api.get('/admin/categories'),
    ])
    const data = (index) => results[index].status === 'fulfilled' ? results[index].value.data : null
    setStats(data(0))
    setAnalytics(data(1) || { monthly_revenue: [], category_distribution: [] })
    setUsers(data(2)?.items || [])
    setProducts(data(3)?.items || [])
    setBookings(data(4)?.items || [])
    setSuspicious(data(5)?.items || [])
    setComplaints(data(6)?.items || [])
    setCategories(data(7)?.items || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  const setProduct = (product) => setProducts((rows) => rows.map((item) => item.id === product.id ? product : item))
  const moderation = async (product, action) => {
    setBusyId(product.id)
    try {
      if (action === 'approve') { const { data } = await api.put(`/admin/products/${product.id}/approval`, { is_approved: true }); setProduct(data.product); toast.success('Listing approved') }
      if (action === 'fraud') { const { data } = await api.put(`/admin/products/${product.id}/fraud`, { is_flagged_fraud: !product.is_flagged_fraud, fraud_reason: product.fraud_reason || '' }); setProducts((rows) => rows.map((item) => item.id === product.id ? { ...item, ...data } : item)); toast.success(product.is_flagged_fraud ? 'Fraud flag cleared' : 'Listing flagged for review') }
      if (action === 'remove') { await api.delete(`/admin/products/${product.id}`); setProducts((rows) => rows.filter((item) => item.id !== product.id)); toast.success('Listing removed') }
    } catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const toggleUser = async (person) => {
    setBusyId(person.id)
    try { const { data } = await api.put(`/admin/users/${person.id}/${person.is_active ? 'ban' : 'unban'}`); setUsers((rows) => rows.map((row) => row.id === person.id ? data.user : row)); toast.success(person.is_active ? 'User deactivated' : 'User reactivated') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const updateComplaint = async (complaintId, status, admin_notes) => {
    setBusyId(complaintId)
    try { const { data } = await api.put(`/admin/complaints/${complaintId}`, { status, admin_notes }); setComplaints((rows) => rows.map((row) => row.id === complaintId ? { ...row, ...data } : row)); toast.success('Complaint updated') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const createCategory = async (event) => {
    event.preventDefault()
    setBusyId('category')
    try { await api.post('/admin/categories', { name: categoryName, parent_category: categoryParent ? Number(categoryParent) : null }); setCategoryName(''); setCategoryParent(''); await load(); toast.success('Category created') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const renameCategory = async (category) => {
    const name = window.prompt('Enter a new category name', category.name)
    if (!name?.trim() || name.trim() === category.name) return
    setBusyId(category.id)
    try { await api.put(`/admin/categories/${category.id}`, { name: name.trim() }); await load(); toast.success('Category renamed') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete “${category.name}”? This is allowed only when it has no listings.`)) return
    setBusyId(category.id)
    try { await api.delete(`/admin/categories/${category.id}`); await load(); toast.success('Category removed') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const reviewSuspicion = async (booking) => {
    setBusyId(`s-${booking.id}`)
    try { await api.put(`/admin/bookings/${booking.id}/fraud-review`, { is_suspicious: false }); setSuspicious((rows) => rows.filter((item) => item.id !== booking.id)); toast.success('Booking flag reviewed and cleared') }
    catch (error) { toast.error(error.message) } finally { setBusyId(null) }
  }
  const filteredUsers = useMemo(() => users.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(userQuery.toLowerCase())), [users, userQuery])
  const mainCategories = categories.filter((item) => !item.parent_category)

  return <main className="admin-page page-container">
    <div className="admin-welcome"><div><span className="eyebrow">Platform control room</span><h1>Admin dashboard</h1><p>Keep the Sharely community healthy and moving.</p></div><div className="admin-badge"><ShieldCheck size={15} /> Admin access</div></div>
    <div className="admin-layout"><aside className="admin-sidebar"><span className="admin-nav-label">Manage platform</span>{[
      ['overview', 'Overview', LayoutDashboard], ['users', 'Users', Users], ['listings', 'Listings', Package], ['bookings', 'All bookings', CalendarDays], ['suspicious', 'Fraud review', AlertTriangle], ['complaints', 'Complaints', FileText], ['categories', 'Categories', FolderTree],
    ].map(([id, label, Icon]) => <button key={id} className={`admin-nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={17} /><span>{label}</span>{id === 'suspicious' && suspicious.length > 0 && <i>{suspicious.length}</i>}</button>)}<button className="admin-nav-item admin-refresh" onClick={load}><Activity size={16} /><span>Refresh data</span></button></aside>
      <section className="admin-content"><div className="admin-content-heading"><div><h2>{tab === 'overview' ? 'Platform overview' : tab === 'suspicious' ? 'Fraud review queue' : tab[0].toUpperCase() + tab.slice(1)}</h2><p>Data from the Sharely MySQL database.</p></div><span className="admin-live"><i /> Live data</span></div>
        {loading ? <div className="admin-loading"><InlineLoader label="Loading platform data…" /></div> : <>
          {tab === 'overview' && <Overview stats={stats} analytics={analytics} onNavigate={setTab} />}
          {tab === 'users' && <UsersPanel rows={filteredUsers} query={userQuery} setQuery={setUserQuery} onToggle={toggleUser} busyId={busyId} />}
          {tab === 'listings' && <ListingsPanel rows={products} onAction={moderation} busyId={busyId} />}
          {tab === 'bookings' && <BookingsPanel rows={bookings} />}
          {tab === 'suspicious' && <SuspiciousPanel rows={suspicious} onReview={reviewSuspicion} busyId={busyId} />}
          {tab === 'complaints' && <ComplaintsPanel rows={complaints} onSave={updateComplaint} busyId={busyId} />}
          {tab === 'categories' && <CategoriesPanel rows={categories} mains={mainCategories} name={categoryName} setName={setCategoryName} parent={categoryParent} setParent={setCategoryParent} onCreate={createCategory} onRename={renameCategory} onDelete={deleteCategory} busyId={busyId} />}
        </>}
      </section>
    </div>
  </main>
}

function StatCard({ label, value, icon: Icon, tone = '', helper, onClick }) {
  return <button className={`admin-stat-card ${tone}`} onClick={onClick}><span className="admin-stat-icon"><Icon size={18} /></span><small>{label}</small><strong>{value ?? '—'}</strong><span className="admin-stat-helper">{helper}</span></button>
}

function Overview({ stats, analytics, onNavigate }) {
  const chartData = analytics.monthly_revenue || []
  const pieData = (analytics.category_distribution || []).filter((item) => item.listings > 0)
  return <div className="admin-overview"><div className="admin-stats-grid">
    <StatCard label="Total users" value={stats?.users?.toLocaleString()} helper={`${stats?.active_users ?? 0} active`} icon={Users} onClick={() => onNavigate('users')} />
    <StatCard label="Active listings" value={stats?.products?.toLocaleString()} helper={`${stats?.pending_product_approval ?? 0} awaiting approval`} icon={Package} tone="violet" onClick={() => onNavigate('listings')} />
    <StatCard label="Bookings" value={stats?.bookings?.toLocaleString()} helper={`${stats?.active_bookings ?? 0} active rentals`} icon={CalendarDays} tone="mint" onClick={() => onNavigate('bookings')} />
    <StatCard label="Verified payments" value={MONEY(stats?.verified_payment_total)} helper="Includes rental + deposit" icon={CircleDollarSign} tone="gold" />
    <StatCard label="Flagged listings" value={stats?.flagged_products ?? 0} helper="Needs admin review" icon={AlertTriangle} tone="rose" onClick={() => onNavigate('listings')} />
    <StatCard label="Open complaints" value={stats?.open_complaints ?? 0} helper="Open or investigating" icon={FileText} tone="slate" onClick={() => onNavigate('complaints')} />
  </div>
  <div className="admin-charts-grid"><div className="admin-chart-card"><div className="admin-chart-heading"><div><span className="eyebrow">Verified rental income</span><h3>Revenue over time</h3></div><span className="chart-period">Monthly</span></div>{chartData.length ? <ResponsiveContainer width="100%" height={260}><AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf1f7" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => [MONEY(value), 'Rental revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} /><Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#revenueFill)" /></AreaChart></ResponsiveContainer> : <ChartEmpty text="Verified rental payments will populate this chart." />}</div>
    <div className="admin-chart-card"><div className="admin-chart-heading"><div><span className="eyebrow">By subcategory</span><h3>Listing distribution</h3></div><span className="chart-period">Live</span></div>{pieData.length ? <div className="category-chart-body"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pieData} dataKey="listings" nameKey="category" innerRadius={57} outerRadius={82} paddingAngle={3}>{pieData.map((item, index) => <Cell key={item.category} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value, _name, item) => [value, item.payload.category]} /></PieChart></ResponsiveContainer><div className="category-chart-legend">{pieData.slice(0, 6).map((item, index) => <div key={item.category}><i style={{ background: COLORS[index % COLORS.length] }} /><span>{item.category}</span><strong>{item.listings}</strong></div>)}</div></div> : <ChartEmpty text="Approved listings will appear by category." />}</div></div>
  <div className="admin-quick-links"><button onClick={() => onNavigate('listings')}><Package size={18} /><span><strong>Review new listings</strong><small>{stats?.pending_product_approval ?? 0} waiting</small></span><ChevronDown size={16} /></button><button onClick={() => onNavigate('suspicious')}><AlertTriangle size={18} /><span><strong>Fraud review queue</strong><small>{stats?.suspicious_bookings ?? 0} flagged bookings</small></span><ChevronDown size={16} /></button><button onClick={() => onNavigate('complaints')}><FileText size={18} /><span><strong>Resolve complaints</strong><small>{stats?.open_complaints ?? 0} open issues</small></span><ChevronDown size={16} /></button></div></div>
}

function ChartEmpty({ text }) { return <div className="chart-empty"><BarChart3 size={23} /><span>{text}</span></div> }

function UsersPanel({ rows, query, setQuery, onToggle, busyId }) {
  return <div className="admin-panel"><div className="panel-toolbar"><div className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" /></div><span>{rows.length} users</span></div><div className="table-card data-table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Location</th><th>Joined</th><th>Account</th><th>Action</th></tr></thead><tbody>{rows.map((person) => <tr key={person.id}><td><div className="admin-person"><span>{person.full_name?.slice(0, 1)?.toUpperCase()}</span><div><strong>{person.full_name}</strong><small>{person.email}</small></div></div></td><td><span className={`role-label ${person.role}`}>{person.role}</span></td><td>{person.location || '—'}</td><td>{new Date(person.created_at || Date.now()).toLocaleDateString()}</td><td><span className={`account-state ${person.is_active ? 'active' : 'inactive'}`}><i />{person.is_active ? 'Active' : 'Inactive'}</span></td><td><button className={`button button-small ${person.is_active ? 'button-danger-outline' : 'button-outline'}`} disabled={busyId === person.id} onClick={() => onToggle(person)}>{person.is_active ? <><Ban size={14} /> Deactivate</> : <><Check size={14} /> Reactivate</>}</button></td></tr>)}</tbody></table>{rows.length === 0 && <ChartEmpty text="No users match that search." />}</div></div>
}

function ListingsPanel({ rows, onAction, busyId }) {
  return <div className="admin-panel"><div className="panel-toolbar"><span>{rows.length} listings</span><span>Fraud flags stay visible until reviewed.</span></div><div className="moderation-list">{rows.map((product) => <article className={`moderation-card ${product.is_flagged_fraud ? 'moderation-flagged' : ''}`} key={product.id}><div className="moderation-image">{product.images?.[0] ? <img src={imageUrl(product.images[0].image_url)} alt="" /> : <Package size={20} />}</div><div className="moderation-info"><div className="moderation-title"><h3>{product.title}</h3>{product.is_flagged_fraud && <span className="fraud-chip"><AlertTriangle size={13} /> AI flagged</span>}{!product.is_approved && <span className="listing-moderation pending">Pending approval</span>}</div><p>{product.location} · {product.condition_status} · Owner #{product.owner_id}</p><strong>{MONEY(product.price_per_day)} <small>/ day</small> · {MONEY(product.security_deposit)} <small>deposit</small></strong>{product.fraud_reason && <div className="fraud-explanation"><AlertTriangle size={13} />{product.fraud_reason}</div>}</div><div className="moderation-actions">{!product.is_approved && <button className="button button-primary button-small" disabled={busyId === product.id} onClick={() => onAction(product, 'approve')}><Check size={14} /> Approve</button>}<button className="button button-outline button-small" disabled={busyId === product.id} onClick={() => onAction(product, 'fraud')}>{product.is_flagged_fraud ? 'Clear flag' : 'Flag fraud'}</button><button className="icon-button danger-icon" disabled={busyId === product.id} onClick={() => onAction(product, 'remove')} aria-label="Remove listing"><Trash2 size={16} /></button></div></article>)}{rows.length === 0 && <ChartEmpty text="No listings to moderate yet." />}</div></div>
}

function BookingsPanel({ rows }) {
  return <div className="table-card data-table-wrap"><table className="data-table"><thead><tr><th>Booking</th><th>Renter / owner</th><th>Dates</th><th>Payable</th><th>Risk</th><th>Status</th></tr></thead><tbody>{rows.map((booking) => <tr key={booking.id}><td><strong>#{booking.id}</strong><small className="table-subtitle">{booking.product_title || `Product ${booking.product_id}`}</small></td><td><small>Renter #{booking.renter_id}</small><small className="table-subtitle">Owner #{booking.owner_id}</small></td><td>{new Date(`${booking.start_date}T12:00:00`).toLocaleDateString()} – {new Date(`${booking.return_date}T12:00:00`).toLocaleDateString()}</td><td>{MONEY(booking.total_payable)}</td><td>{booking.is_suspicious ? <span className="fraud-chip"><AlertTriangle size={12} /> Flagged</span> : '—'}</td><td><StatusPill status={booking.status} /></td></tr>)}</tbody></table>{rows.length === 0 && <ChartEmpty text="Booking activity will appear here." />}</div>
}

function SuspiciousPanel({ rows, onReview, busyId }) {
  return <div className="suspicious-list">{rows.map((booking) => <article className="suspicious-card" key={booking.id}><span className="suspicious-icon"><AlertTriangle size={18} /></span><div className="suspicious-info"><div><strong>Booking #{booking.id} · {booking.product_title}</strong><StatusPill status={booking.status} /></div><p>{booking.suspicion_reason || 'Flagged for admin review.'}</p><small>Renter #{booking.renter_id} · {new Date(booking.created_at).toLocaleString()}</small></div><button className="button button-outline button-small" disabled={busyId === `s-${booking.id}`} onClick={() => onReview(booking)}><Check size={14} /> Mark reviewed</button></article>)}{rows.length === 0 && <ChartEmpty text="No suspicious bookings are waiting for review." />}</div>
}

function ComplaintsPanel({ rows, onSave, busyId }) {
  const [drafts, setDrafts] = useState({})
  const update = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }))
  return <div className="complaint-list">{rows.map((complaint) => { const draft = drafts[complaint.id] || {}; return <article className="complaint-card" key={complaint.id}><div className="complaint-head"><div><span className="eyebrow">Complaint #{complaint.id} · Booking #{complaint.booking_id}</span><h3>{complaint.subject}</h3></div><StatusPill status={draft.status || complaint.status} /></div><p>{complaint.description}</p><small>Filed by member #{complaint.complainant_id} · {new Date(complaint.created_at).toLocaleDateString()}</small><div className="complaint-edit"><label>Status<select value={draft.status || complaint.status} onChange={(event) => update(complaint.id, 'status', event.target.value)}><option>Open</option><option>Investigating</option><option>Resolved</option></select></label><label>Admin notes<textarea rows={2} value={draft.admin_notes ?? complaint.admin_notes ?? ''} onChange={(event) => update(complaint.id, 'admin_notes', event.target.value)} placeholder="Add a resolution note" /></label><button className="button button-primary button-small" disabled={busyId === complaint.id} onClick={() => onSave(complaint.id, draft.status || complaint.status, draft.admin_notes ?? complaint.admin_notes ?? '')}>Save resolution</button></div></article> })}{rows.length === 0 && <ChartEmpty text="There are no complaints to review." />}</div>
}

function CategoriesPanel({ rows, mains, name, setName, parent, setParent, onCreate, onRename, onDelete, busyId }) {
  return <div className="categories-admin"><form className="category-create-form" onSubmit={onCreate}><div><span className="eyebrow">Category manager</span><h3>Add a category</h3><p>Subcategories belong directly to a main category.</p></div><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" /><select value={parent} onChange={(event) => setParent(event.target.value)}><option value="">Main category</option>{mains.map((item) => <option key={item.id} value={item.id}>Under {item.name}</option>)}</select><button className="button button-primary button-small" disabled={busyId === 'category'}><Plus size={14} /> Add</button></form><div className="category-admin-list">{mains.map((main) => <div className="category-admin-group" key={main.id}><div className="category-admin-row main"><CategoryIcon name={main.icon_name} /><strong>{main.name}</strong><span>Main category</span><button className="text-button" onClick={() => onRename(main)}>Rename</button><button className="icon-button danger-icon" disabled={busyId === main.id} onClick={() => onDelete(main)} aria-label={`Delete ${main.name}`}><Trash2 size={15} /></button></div>{rows.filter((item) => item.parent_category === main.id).map((sub) => <div className="category-admin-row sub" key={sub.id}><span className="category-tree-line" /><span>{sub.name}</span><span>Subcategory</span><button className="text-button" onClick={() => onRename(sub)}>Rename</button><button className="icon-button danger-icon" disabled={busyId === sub.id} onClick={() => onDelete(sub)} aria-label={`Delete ${sub.name}`}><Trash2 size={15} /></button></div>)}</div>)}</div></div>
}
