import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ChevronDown, Filter, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../api'
import { ProductGrid, SectionHeading } from '../components/Shared'

const readFilters = (params) => ({
  q: params.get('q') || '', category: params.get('category') || '', subcategory: params.get('subcategory') || '',
  location: params.get('location') || '', min_price: params.get('min_price') || '0',
  max_price: params.get('max_price') || '10000', start_date: params.get('start_date') || '',
  end_date: params.get('end_date') || '', sort: params.get('sort') || 'newest',
})

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => readFilters(searchParams))
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const mainCategories = useMemo(() => categories.filter((item) => !item.parent_category), [categories])
  const subcategories = useMemo(() => categories.filter((item) => item.parent_category === Number(filters.category)), [categories, filters.category])

  useEffect(() => {
    setFilters(readFilters(searchParams))
  }, [searchParams])

  useEffect(() => {
    api.get('/admin/categories').then(({ data }) => setCategories(data.items || [])).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => { if (alive) setLoading(true) }, 150)
    const params = Object.fromEntries(Object.entries(filters).filter(([key, value]) => {
      if (key === 'min_price') return Number(value) > 0
      if (key === 'max_price') return Number(value) < 10000
      if (key === 'start_date' || key === 'end_date') return Boolean(filters.start_date && filters.end_date)
      return Boolean(value) && key !== 'page'
    }))
    const request = window.setTimeout(() => api.get('/products', { params: { ...params, per_page: 24 } }).then(({ data }) => {
      if (alive) { setProducts(data.items || []); setTotal(data.total || 0) }
    }).catch(() => { if (alive) { setProducts([]); setTotal(0) } }).finally(() => { if (alive) setLoading(false) }), 180)
    return () => { alive = false; window.clearTimeout(timer); window.clearTimeout(request) }
  }, [filters])

  const update = (key, value) => setFilters((current) => {
    const next = { ...current, [key]: value }
    if (key === 'min_price' && Number(value) > Number(current.max_price)) next.max_price = value
    if (key === 'max_price' && Number(value) < Number(current.min_price)) next.min_price = value
    return next
  })
  const apply = (event) => {
    event?.preventDefault()
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && !((key === 'min_price' && value === '0') || (key === 'max_price' && value === '10000'))) params.set(key, value)
    })
    setSearchParams(params)
    setFiltersOpen(false)
  }
  const clear = () => {
    const reset = { q: '', category: '', subcategory: '', location: '', min_price: '0', max_price: '10000', start_date: '', end_date: '', sort: 'newest' }
    setFilters(reset)
    setSearchParams({})
  }

  return <main className="page-container browse-page">
    <div className="browse-topline"><span className="eyebrow">Share something good</span><span>Home <i>/</i> Browse rentals</span></div>
    <div className="browse-heading"><SectionHeading eyebrow="Find your next rental" title={filters.q ? `Results for “${filters.q}”` : 'Browse all rentals'} description="Useful things, shared by people nearby." />
      <button className="button button-outline mobile-filter-trigger" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16} /> Filters</button>
    </div>
    <div className="browse-layout">
      <aside className={`filter-sidebar ${filtersOpen ? 'filters-open' : ''}`}>
        <div className="filter-head"><div><Filter size={17} /><strong>Filters</strong></div><button className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button></div>
        <form onSubmit={apply}>
          <div className="filter-group"><label htmlFor="filter-search">Search</label><input id="filter-search" className="field-input" value={filters.q} onChange={(event) => update('q', event.target.value)} placeholder="Camera, drill, tent…" /></div>
          <div className="filter-group"><label htmlFor="category-filter">Category</label><div className="select-wrap"><select id="category-filter" className="field-input" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value, subcategory: '' }))}><option value="">All categories</option>{mainCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><ChevronDown size={15} /></div></div>
          {filters.category && <div className="filter-group"><label htmlFor="subcategory-filter">Subcategory</label><div className="select-wrap"><select id="subcategory-filter" className="field-input" value={filters.subcategory} onChange={(event) => update('subcategory', event.target.value)}><option value="">All subcategories</option>{subcategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><ChevronDown size={15} /></div></div>}
          <div className="filter-group"><label htmlFor="location-filter">Location</label><input id="location-filter" className="field-input" value={filters.location} onChange={(event) => update('location', event.target.value)} placeholder="City or neighborhood" /></div>
          <div className="filter-group"><div className="filter-label-row"><label>Daily price</label><span>₹{Number(filters.min_price).toLocaleString('en-IN')} – ₹{Number(filters.max_price).toLocaleString('en-IN')}{Number(filters.max_price) >= 10000 ? '+' : ''}</span></div>
            <div className="range-stack"><input aria-label="Minimum price" type="range" min="0" max="10000" step="100" value={filters.min_price} onChange={(event) => update('min_price', event.target.value)} /><input aria-label="Maximum price" type="range" min="0" max="10000" step="100" value={filters.max_price} onChange={(event) => update('max_price', event.target.value)} /></div>
            <div className="range-labels"><span>₹0</span><span>₹10,000+</span></div>
          </div>
          <div className="filter-group"><label>Available dates</label><div className="date-filter-stack"><input className="field-input" type="date" aria-label="Start date" value={filters.start_date} onChange={(event) => update('start_date', event.target.value)} /><span>to</span><input className="field-input" type="date" aria-label="End date" value={filters.end_date} onChange={(event) => update('end_date', event.target.value)} /></div></div>
          <div className="filter-actions"><button type="button" className="filter-clear" onClick={clear}>Clear all</button><button className="button button-primary">Apply filters</button></div>
        </form>
      </aside>
      {filtersOpen && <button className="filter-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}
      <section className="browse-results">
        <div className="results-toolbar"><div><strong>{loading ? 'Finding rentals…' : `${total.toLocaleString()} ${total === 1 ? 'rental' : 'rentals'}`}</strong><span> in your community</span></div><label className="sort-control"><ArrowDownWideNarrow size={16} /><span>Sort:</span><div className="select-wrap"><select value={filters.sort} aria-label="Sort listings" onChange={(event) => update('sort', event.target.value)}><option value="newest">Recently added</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select><ChevronDown size={14} /></div></label></div>
        <ProductGrid products={products} loading={loading} emptyTitle="No rentals match those filters" emptyText="Try a different category, date, or location." />
      </section>
    </div>
  </main>
}
