import React, {useState, useEffect} from 'react'
import ProductList from './components/ProductList'
import Cart from './components/Cart'

export default function App(){
  const [cart, setCart] = useState([])
  const [scrollY, setScrollY] = useState(0)

  useEffect(()=>{
    const stored = localStorage.getItem('cart')
    if(stored) setCart(JSON.parse(stored))
  },[])

  useEffect(()=>{
    localStorage.setItem('cart', JSON.stringify(cart))
  },[cart])

  useEffect(()=>{
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  },[])

  const addToCart = (product) => {
    setCart(prev=>{
      const existing = prev.find(i=>i.productId===product.id)
      if(existing){
        return prev.map(i=>i.productId===product.id?{...i, quantity:i.quantity+1}:i)
      }
      return [...prev, {productId: product.id, name: product.name, price: product.price, quantity:1}]
    })
  }

  return (
    <div className="app">
      <div className="background-wrapper">
        <div className="gradient-bg" style={{transform: `translateY(${scrollY * 0.5}px)`}}></div>
        <div className="floating-orbs"></div>
      </div>
      
      <header className="header-hero" style={{transform: `translateY(${scrollY * 0.3}px)`}}>
        <div className="hero-content">
          <h1 className="hero-title">ModernStore</h1>
          <p className="hero-subtitle">Premium Products for Modern Living</p>
          <div className="hero-line"></div>
        </div>
      </header>

      <div className="container">
        <Cart cart={cart} setCart={setCart} />
        <ProductList addToCart={addToCart} />
      </div>

      <footer className="footer">
        <div className="footer-content">
          <p>© 2026 ModernStore. Crafted with precision.</p>
        </div>
      </footer>
    </div>
  )
}
