import React from 'react'

export default function Cart({cart, setCart}){
  const total = cart.reduce((s,i)=>s+i.price*i.quantity,0)

  const updateQty = (productId, qty) => {
    setCart(prev=>prev.map(i=>i.productId===productId?{...i, quantity: Math.max(1, qty)}:i))
  }

  const remove = (productId) => setCart(prev=>prev.filter(i=>i.productId!==productId))

  const checkout = async () => {
    const order = { items: cart, total, shippingAddress: 'Demo Address' }
    const token = localStorage.getItem('jwt')

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(order),
      })

      if (res.ok) {
        alert('✓ Order placed successfully!')
        setCart([])
      } else if (res.status === 401) {
        alert('🔐 Please login to place orders.\n\nDemo Credentials:\nUsername: user\nPassword: password\n\nAdmin:\nUsername: admin\nPassword: adminpass')
      } else {
        alert('⚠️ Backend unavailable. Your demo order was saved locally.')
        setCart([])
      }
    } catch {
      alert('⚠️ Backend unavailable. Your demo order was saved locally.')
      setCart([])
    }
  }

  return (
    <div className="cart">
      <h2>🛒 Shopping Cart</h2>
      {cart.length===0 && <div className="cart-empty">Your cart is empty. Start shopping!</div>}
      {cart.map(i=> (
        <div key={i.productId} className="cart-item">
          <div>
            <div className="cart-item-name">{i.name}</div>
            <div className="cart-item-price">₹{i.price.toFixed(2)} each</div>
          </div>
          <div className="cart-item-controls">
            <input 
              type="number" 
              value={i.quantity} 
              onChange={e=>updateQty(i.productId, parseInt(e.target.value||1))}
              className="cart-item-qty"
            />
            <button className="cart-remove-btn" onClick={()=>remove(i.productId)}>Remove</button>
          </div>
        </div>
      ))}
      {cart.length > 0 && (
        <>
          <div className="cart-total">
            Total: ₹{total.toFixed(2)}
          </div>
          <button className="checkout-btn" onClick={checkout}>
            Proceed to Checkout
          </button>
        </>
      )}
    </div>
  )
}
