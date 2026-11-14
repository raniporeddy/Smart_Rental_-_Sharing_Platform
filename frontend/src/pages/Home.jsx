import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, CircleCheck, Clock3, PackageCheck, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { CategoryIcon, ProductGrid, SectionHeading } from '../components/Shared'

export default function Home() {
  const [categories, setCategories] = useState([])
  const [featured, setFeatured] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      api.get('/admin/categories'),
      api.get('/ai/recommendations', { params: { limit: 4 } }),
      api.get('/products', { params: { sort: 'newest', per_page: 4 } }),
    ]).then(([categoryResult, featuredResult, recentResult]) => {
      if (!alive) return
      if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value.data.items || [])
      if (featuredResult.status === 'fulfilled') setFeatured((featuredResult.value.data.items || []).map((entry) => entry.product))
      if (recentResult.status === 'fulfilled') setRecent(recentResult.value.data.items || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const mainCategories = categories.filter((category) => !category.parent_category)
  const search = (event) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (location.trim()) params.set('location', location.trim())
    navigate(`/browse?${params.toString()}`)
  }

  return <main>
    <section className="hero-section">
      <div className="hero-inner page-container">
        <div className="hero-copy">
          <span className="hero-kicker"><span className="kicker-dot" /> Your neighborhood, shared</span>
          <h1>Good things are<br /><em>better shared.</em></h1>
          <p>Find the gear you need, right around the corner. Rent from people nearby, and make room for more.</p>
          <form className="hero-search" onSubmit={search}>
            <label className="hero-search-field"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are you looking for?" aria-label="Rental to search" /></label>
            <span className="hero-search-divider" />
            <label className="hero-search-location"><span className="pin-small">⌖</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" aria-label="Location" /></label>
            <button className="button button-primary hero-search-button">Find a rental <ArrowRight size={16} /></button>
          </form>
          <div className="hero-notes"><span><ShieldCheck size={15} /> Verified community</span><span><CircleCheck size={15} /> Simple, secure booking</span></div>
        </div>
        <div className="hero-art" aria-label="Shared outdoor camera and travel gear illustration">
          <div className="hero-art-orbit orbit-one" /><div className="hero-art-orbit orbit-two" />
          <div className="hero-art-image" aria-hidden="true"><div className="hero-camera"><span className="camera-top" /><span className="camera-flash" /><span className="camera-lens"><i /></span><span className="camera-grip" /></div><div className="hero-camera-shadow" /><span className="camera-strap" /></div>
          <div className="hero-floating-card hero-card-top"><span className="hero-float-icon"><PackageCheck size={17} /></span><div><strong>Ready when you are</strong><small>Book by the day</small></div></div>
          <div className="hero-floating-card hero-card-bottom"><span className="hero-people">⌂</span><div><strong>Share local, live better</strong><small>Tools and gear in your community</small></div></div>
          <div className="hero-sparkle sparkle-a">✳</div><div className="hero-sparkle sparkle-b">✦</div>
        </div>
      </div>
      <div className="hero-bottom-curve" />
    </section>

    <section className="category-section page-container section-space">
      <SectionHeading eyebrow="Explore the possibilities" title="What do you need today?" description="A little less buying. A lot more doing." action={<Link to="/browse" className="text-link">Explore all <ArrowUpRight size={16} /></Link>} />
      {loading ? <div className="category-grid">{Array.from({ length: 6 }, (_, i) => <div className="category-skeleton" key={i} />)}</div> : <div className="category-grid">{mainCategories.map((category, index) => <Link key={category.id} to={`/browse?category=${category.id}`} className={`category-card category-tone-${index % 6}`}>
        <span className="category-card-icon"><CategoryIcon name={category.icon_name} /></span><span className="category-card-label">{category.name}</span><ArrowUpRight size={16} className="category-arrow" />
      </Link>)}</div>}
    </section>

    <section className="featured-section section-space">
      <div className="page-container"><SectionHeading eyebrow="Picked for your next plan" title="Popular right now" description="Community favorites, ready for their next adventure." action={<Link to="/browse?sort=newest" className="text-link">See all rentals <ArrowRight size={16} /></Link>} />
        <ProductGrid products={featured} loading={loading} emptyTitle="The next great find is around the corner" emptyText="There are no featured listings just yet. Check back as neighbors start sharing." />
      </div>
    </section>

    <section className="recent-section page-container section-space">
      <SectionHeading eyebrow="Fresh on Sharely" title="Recently added" description="New listings from people in your community." action={<Link to="/browse?sort=newest" className="text-link">Browse new arrivals <ArrowRight size={16} /></Link>} />
      <ProductGrid products={recent} loading={loading} emptyTitle="Fresh finds are on the way" emptyText="Be the first to list something useful in your neighborhood." />
    </section>

    <section className="how-section">
      <div className="page-container section-space"><div className="how-intro"><span className="eyebrow">Easy as 1, 2, shared</span><h2>More doing.<br /><em>Less owning.</em></h2><p>From finding a weekend camera to lending out a spare drill, Sharely keeps the whole thing simple.</p><Link to="/browse" className="button button-dark">See how it works <ArrowRight size={16} /></Link></div>
        <div className="how-steps">
          <div className="how-step"><span className="step-number">01</span><span className="step-icon"><Search size={21} /></span><h3>Find your thing</h3><p>Search useful gear from people in your area.</p></div>
          <div className="how-step"><span className="step-number">02</span><span className="step-icon"><Clock3 size={21} /></span><h3>Choose your dates</h3><p>Pick the days that fit your plan and send a request.</p></div>
          <div className="how-step"><span className="step-number">03</span><span className="step-icon"><CircleCheck size={21} /></span><h3>Meet and enjoy</h3><p>Your host confirms. You pay securely in the app and collect your rental.</p></div>
          <div className="how-step"><span className="step-number">04</span><span className="step-icon"><Sparkles size={21} /></span><h3>Return and repeat</h3><p>Bring it back on time, leave a review, and share the next good thing.</p></div>
        </div>
      </div>
    </section>
    <section className="home-cta page-container"><div><span className="eyebrow">Have something sitting around?</span><h2>Make your spare stuff<br />someone's next great day.</h2></div><Link to="/dashboard?tab=listings" className="button button-primary">List an item <ArrowRight size={16} /></Link></section>
  </main>
}
