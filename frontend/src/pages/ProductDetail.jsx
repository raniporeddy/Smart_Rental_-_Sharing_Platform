import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Heart, MapPin, ShieldCheck, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, imageUrl, localDateISO } from '../api'
import { useAuth } from '../context/AuthContext'
import { ProductGrid } from '../components/Shared'

const todayISO = () => localDateISO()
const addDays = (value, count) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + count); return date.toISOString().slice(0, 10) }
const dateRange = (start, end) => {
  if (!start || !end) return []
  const values = []
  for (let date = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`); date <= last; date.setDate(date.getDate() + 1)) values.push(date.toISOString().slice(0, 10))
  return values
}

function MonthCalendar({ bookedDates = [] }) {
  const [month, setMonth] = useState(() => new Date())
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const booked = new Set(bookedDates.flatMap((range) => dateRange(range.start_date, range.end_date)))
  const today = todayISO()
  return <div className="calendar-card">
    <div className="calendar-head"><div><CalendarDays size={16} /><strong>{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</strong></div><div className="calendar-arrows"><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={17} /></button><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={17} /></button></div></div>
    <div className="calendar-grid calendar-weekdays">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className="calendar-grid calendar-days">{Array.from({ length: offset }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index + 1)
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
      return <span key={iso} className={`calendar-day ${booked.has(iso) ? 'booked' : ''} ${iso === today ? 'today' : ''}`} title={booked.has(iso) ? 'Booked' : 'Available'}>{index + 1}</span>
    })}</div>
    <div className="calendar-legend"><span><i className="legend-available" />Available</span><span><i className="legend-booked" />Booked</span></div>
  </div>
}

export default function ProductDetail() {
  const { id } = useParams()
  const { user, savedIds, toggleSaved } = useAuth()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [owner, setOwner] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [reviews, setReviews] = useState([])
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.allSettled([
      api.get(`/products/${id}`), api.get(`/products/${id}/availability`),
      api.get(`/reviews/product/${id}`), api.get('/ai/recommendations', { params: { limit: 4 } }),
    ]).then(async ([productResult, availabilityResult, reviewResult, relatedResult]) => {
      if (!alive) return
      if (productResult.status === 'fulfilled') {
        const current = productResult.value.data.product
        setProduct(current)
        api.get(`/users/${current.owner_id}`).then(({ data }) => { if (alive) setOwner(data) }).catch(() => {})
      }
      if (availabilityResult.status === 'fulfilled') setAvailability(availabilityResult.value.data)
      if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value.data.items || [])
      if (relatedResult.status === 'fulfilled') setRelated((relatedResult.value.data.items || []).map((item) => item.product).filter((item) => item.id !== Number(id)).slice(0, 3))
      setLoading(false)
    })
    return () => { alive = false }
  }, [id])

  const images = product?.images || []
  const currentImage = images[selectedImage]?.image_url
  const avgRating = useMemo(() => reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : null, [reviews])
  const days = startDate && endDate && endDate >= startDate ? Math.floor((new Date(`${endDate}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000) + 1 : 0
  const total = days ? days * Number(product?.price_per_day || 0) + Number(product?.security_deposit || 0) : 0
  const booked = useMemo(() => new Set((availability?.booked_dates || []).flatMap((range) => dateRange(range.start_date, range.end_date))), [availability])
  const datesAvailable = useMemo(() => {
    if (!days) return false
    const requested = dateRange(startDate, endDate)
    return !requested.some((day) => booked.has(day)) && (!availability?.available_from || startDate >= availability.available_from) && (!availability?.available_to || endDate <= availability.available_to)
  }, [availability, booked, days, endDate, startDate])

  const submitBooking = async () => {
    if (!user) { navigate('/login', { state: { from: `/products/${id}` } }); return }
    if (!datesAvailable) { toast.error('Choose dates that are available'); return }
    setBooking(true)
    try {
      await api.post('/bookings/request', { product_id: Number(id), start_date: startDate, return_date: endDate })
      toast.success('Request sent. The owner will respond soon.')
      navigate('/dashboard?tab=bookings')
    } catch (error) { toast.error(error.message) } finally { setBooking(false) }
  }
  const saveListing = async () => {
    if (!user) { navigate('/login', { state: { from: `/products/${id}` } }); return }
    try { const result = await toggleSaved(Number(id)); toast.success(result ? 'Saved to your list' : 'Removed from saved') }
    catch (error) { toast.error(error.message) }
  }
  if (loading) return <main className="page-container detail-loading"><div className="skeleton skeleton-detail-image" /><div><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-card" /></div></main>
  if (!product) return <main className="page-container detail-not-found"><Link to="/browse" className="text-link"><ArrowLeft size={16} /> Back to browse</Link><h1>This rental isn't available</h1><p>It may have been removed or is waiting for approval.</p></main>

  return <main className="page-container product-detail-page">
    <div className="detail-breadcrumb"><Link to="/browse"><ArrowLeft size={15} /> Browse rentals</Link><span>/</span><span>{product.title}</span></div>
    <div className="detail-layout">
      <section className="detail-main">
        <div className="detail-gallery">
          <div className="gallery-main">{currentImage ? <img src={imageUrl(currentImage)} alt={product.title} /> : <div className="image-placeholder image-placeholder-large">No listing photo</div>}<button className={`gallery-save ${savedIds.includes(Number(id)) ? 'saved' : ''}`} onClick={saveListing} aria-label="Save this rental"><Heart size={18} fill={savedIds.includes(Number(id)) ? 'currentColor' : 'none'} /></button></div>
          {images.length > 1 && <div className="gallery-thumbs">{images.map((image, index) => <button key={image.id} className={selectedImage === index ? 'selected' : ''} onClick={() => setSelectedImage(index)} aria-label={`View image ${index + 1}`}><img src={imageUrl(image.image_url)} alt="" /></button>)}</div>}
        </div>
        <div className="detail-title-row"><div><span className="eyebrow">{product.condition_status} condition</span><h1>{product.title}</h1><div className="detail-meta"><span><MapPin size={15} />{product.location}</span><span>·</span><span>{avgRating ? <><Star size={15} fill="currentColor" />{avgRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</> : 'No reviews yet'}</span></div></div><div className="detail-rate"><strong>₹{Number(product.price_per_day).toLocaleString('en-IN')}</strong><span>per day</span></div></div>
        <div className="detail-description"><h2>About this rental</h2><p>{product.description}</p></div>
        <div className="detail-owner-card"><div className="owner-avatar">{owner?.avatar_url ? <img src={imageUrl(owner.avatar_url)} alt="" /> : owner?.full_name?.slice(0, 1)?.toUpperCase()}</div><div className="owner-details"><span className="eyebrow">Your host</span><strong>{owner?.full_name || 'Sharely member'} <BadgeCheck size={15} /></strong><small><MapPin size={13} />{owner?.location || product.location}</small></div><div className="owner-since">Member since<br /><strong>{owner?.created_at ? new Date(owner.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : 'Sharely'}</strong></div></div>
        <div className="detail-availability"><div className="detail-subheading"><div><h2>Availability</h2><p>Days shaded in coral are already booked.</p></div><span className="calendar-key"><i /> Booked</span></div><MonthCalendar bookedDates={availability?.booked_dates} /></div>
        <section className="detail-reviews"><div className="detail-subheading"><div><h2>Reviews from renters</h2><p>{avgRating ? `${avgRating.toFixed(1)} average · ${reviews.length} verified ${reviews.length === 1 ? 'renter' : 'renters'}` : 'Be the first to share your experience.'}</p></div>{avgRating && <div className="review-average"><Star size={17} fill="currentColor" />{avgRating.toFixed(1)}</div>}</div>
          {reviews.length ? <div className="review-list">{reviews.slice(0, 8).map((review) => <article className="review-item" key={review.id}><div className="review-avatar">{String(review.reviewer_id).slice(-1)}</div><div><div className="review-head"><strong>Verified renter</strong><span>{new Date(review.created_at).toLocaleDateString()}</span></div><div className="review-stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={13} fill={index < review.rating ? 'currentColor' : 'none'} />)}</div>{review.comment && <p>{review.comment}</p>}</div></article>)}</div> : <div className="review-empty"><ShieldCheck size={20} /><span>Reviews are written only after a completed rental.</span></div>}
        </section>
      </section>
      <aside className="booking-sidebar"><div className="booking-box"><div className="booking-box-top"><div><strong>₹{Number(product.price_per_day).toLocaleString('en-IN')}</strong><span> / day</span></div><span className="secure-tag"><ShieldCheck size={14} /> Secure</span></div>
        <div className="booking-date-fields"><label>Start date<input type="date" min={todayISO()} value={startDate} onChange={(event) => { setStartDate(event.target.value); if (!endDate || event.target.value > endDate) setEndDate(addDays(event.target.value, 0)) }} /></label><label>Return date<input type="date" min={startDate || todayISO()} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
        {days > 0 && <div className="booking-costs"><div><span>₹{Number(product.price_per_day).toLocaleString('en-IN')} × {days} {days === 1 ? 'day' : 'days'}</span><strong>₹{(days * Number(product.price_per_day)).toLocaleString('en-IN')}</strong></div><div><span>Refundable security deposit</span><strong>₹{Number(product.security_deposit).toLocaleString('en-IN')}</strong></div><div className="booking-total"><span>Total payable</span><strong>₹{total.toLocaleString('en-IN')}</strong></div></div>}
        {startDate && endDate && <div className={`availability-message ${datesAvailable ? 'available' : 'unavailable'}`}>{datesAvailable ? <><BadgeCheck size={15} /> These dates are available</> : <><X size={15} /> Those dates aren't available</>}</div>}
        <button className="button button-primary booking-submit" disabled={booking || (Boolean(startDate && endDate) && !datesAvailable)} onClick={submitBooking}>{booking ? 'Sending request…' : user ? 'Request to book' : 'Sign in to book'}<ArrowRight size={16} /></button>
        <p className="booking-note">You won't be charged until the owner approves your request.</p>
        <div className="deposit-note"><ShieldCheck size={16} /><span>Your ₹{Number(product.security_deposit).toLocaleString('en-IN')} deposit is held separately and may be refunded after return, subject to the platform's deposit policy.</span></div>
      </div><div className="booking-help">Questions about the item? <button onClick={() => window.dispatchEvent(new Event('srsp:open-chat'))}>Ask Sharely <ArrowRight size={13} /></button></div></aside>
    </div>
    {related.length > 0 && <section className="related-section"><div className="detail-subheading"><div><h2>You might also like</h2><p>More useful finds in the community.</p></div><Link to="/browse" className="text-link">Browse all <ArrowRight size={15} /></Link></div><ProductGrid products={related} /></section>}
  </main>
}
