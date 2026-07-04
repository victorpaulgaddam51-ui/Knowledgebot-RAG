import React, {useEffect, useState} from 'react'

const fallbackProducts = [
  {
    id: 1,
    name: 'Aurora Lamp',
    description: 'A sculptural LED lamp that brings warm ambient light to any space.',
    price: 129.99,
    category: 'Lighting',
    imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    name: 'Nova Chair',
    description: 'Ergonomic comfort with a minimalist silhouette for modern interiors.',
    price: 249.5,
    category: 'Furniture',
    imageUrl: 'https://images.unsplash.com/photo-1519947486511-46149fa0a254?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    name: 'Luna Headphones',
    description: 'Immersive sound and elegant design for daily listening.',
    price: 179.0,
    category: 'Audio',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 4,
    name: 'Aero Bottle',
    description: 'Double-wall insulation with a premium finish for everyday carry.',
    price: 49.99,
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80',
  },
]

export default function ProductList({addToCart}){
  const [products, setProducts] = useState(fallbackProducts)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([...new Set(fallbackProducts.map(p => p.category))])

  useEffect(()=>{
    let ignore = false

    const loadProducts = async () => {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          fetch('/api/products').then(async (response) => {
            if (!response.ok) throw new Error('Products API unavailable')
            return response.json()
          }),
          fetch('/api/products/categories').then(async (response) => {
            if (!response.ok) throw new Error('Categories API unavailable')
            return response.json()
          }),
        ])

        if (!ignore) {
          const nextProducts = Array.isArray(productsRes) ? productsRes : fallbackProducts
          const nextCategories = Array.isArray(categoriesRes) ? categoriesRes : [...new Set(fallbackProducts.map(p => p.category))]
          setProducts(nextProducts)
          setCategories(nextCategories)
        }
      } catch {
        if (!ignore) {
          setProducts(fallbackProducts)
          setCategories([...new Set(fallbackProducts.map(p => p.category))])
        }
      }
    }

    loadProducts()
    return () => { ignore = true }
  },[])

  const filtered = products.filter(p=>{
    const searchTerm = (p.name || '').toLowerCase()
    const descriptionText = (p.description || '').toLowerCase()
    return (search==='' || searchTerm.includes(search.toLowerCase()) || descriptionText.includes(search.toLowerCase()))
      && (category==='' || p.category===category)
  })

  return (
    <div>
      <div className="search-row">
        <input 
          placeholder="🔍 Search products..." 
          value={search} 
          onChange={e=>setSearch(e.target.value)} 
        />
        <select value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="product-grid">
        {filtered.map((p, idx)=> (
          <div key={p.id} className="card" style={{animationDelay: `${idx * 0.1}s`}}>
            <img src={p.imageUrl} alt={p.name} />
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <div className="card-footer">
              <span className="card-price">₹{Number(p.price).toFixed(2)}</span>
              <button className="card-button" onClick={()=>addToCart(p)}>Add to Cart</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
