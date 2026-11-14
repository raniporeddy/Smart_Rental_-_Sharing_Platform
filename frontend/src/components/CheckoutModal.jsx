import { useEffect, useState } from 'react'
import { BadgeCheck, CreditCard, LoaderCircle, ShieldCheck, Smartphone, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { api } from '../api'
import { Modal } from './Shared'

export default function CheckoutModal({ booking, onClose, onVerified }) {
  const [order, setOrder] = useState(null)
  const [method, setMethod] = useState('UPI')
  const [upiId, setUpiId] = useState('')
  const [step, setStep] = useState('method')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [orderError, setOrderError] = useState('')

  useEffect(() => {
    let alive = true
    api.post(`/payments/orders/${booking.id}`).then(({ data }) => { if (alive) setOrder(data.order) })
      .catch((error) => { if (alive) setOrderError(error.message) })
    return () => { alive = false }
  }, [booking.id])

  const verify = async () => {
    if (!order) return
    setBusy(true)
    try {
      const endpoint = method === 'UPI' ? '/payments/verify-upi' : '/payments/verify'
      const payload = { payment_id: order.payment_id, confirmation_token: order.confirmation_token }
      if (method === 'UPI') payload.upi_id = upiId
      else payload.payment_method = method
      const { data } = await api.post(endpoint, payload)
      if (data.payment_status !== 'Verified' || data.booking?.status !== 'Confirmed') throw new Error('Payment could not be verified. Your booking is not confirmed.')
      setReceipt(data)
      setStep('receipt')
      toast.success('Payment verified and booking confirmed')
      onVerified?.(data)
    } catch (error) { toast.error(error.message) }
    finally { setBusy(false) }
  }

  const amount = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return <Modal title={step === 'receipt' ? 'You’re all set' : 'Secure checkout'} subtitle={step === 'receipt' ? 'Your payment has been verified.' : 'Your payment is simulated. No real money will move.'} onClose={onClose} size="checkout-modal">
    {orderError ? <div className="checkout-error"><p>{orderError}</p><button className="button button-outline" onClick={onClose}>Close</button></div> : !order ? <div className="checkout-loading"><LoaderCircle className="spin" size={24} /><span>Preparing secure order…</span></div> : step === 'receipt' ? <div className="receipt-panel">
      <div className="receipt-success"><BadgeCheck size={31} /><span>Payment verified</span><strong>{amount(receipt?.booking?.total_payable)}</strong></div>
      <div className="receipt-row"><span>Booking</span><strong>#{booking.id}</strong></div><div className="receipt-row"><span>Transaction</span><strong>{receipt?.transaction_id}</strong></div>
      <div className="receipt-row"><span>Status</span><strong>Confirmed</strong></div><p>The owner can now record item handover on the rental start date.</p>
      <button className="button button-primary full-width" onClick={onClose}>Done</button>
    </div> : <>
      <div className="checkout-summary"><div className="checkout-item-line"><span>{booking.product_title || `Rental #${booking.product_id}`} <small>{booking.total_days} {booking.total_days === 1 ? 'day' : 'days'} × {amount(booking.rental_amount / booking.total_days)}</small></span><strong>{amount(order.rental_amount)}</strong></div><div className="checkout-item-line"><span>Refundable security deposit<small>Held separately</small></span><strong>{amount(order.security_deposit)}</strong></div><div className="checkout-total"><span>Total payable</span><strong>{amount(order.total_payable)}</strong></div></div>
      <div className="payment-method-label">Choose a payment method</div>
      <div className="payment-methods"><button className={method === 'UPI' ? 'selected' : ''} onClick={() => { setMethod('UPI'); setStep('method') }}><Smartphone size={18} /><span>UPI</span></button><button className={method === 'Card' ? 'selected' : ''} onClick={() => { setMethod('Card'); setStep('method') }}><CreditCard size={18} /><span>Test card</span></button><button className={method === 'NetBanking' ? 'selected' : ''} onClick={() => { setMethod('NetBanking'); setStep('method') }}><ShieldCheck size={18} /><span>Net banking</span></button></div>
      {method === 'UPI' && step === 'method' && <div className="payment-step"><label>UPI ID<input value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@bank" autoComplete="off" /></label><button className="button button-primary full-width" disabled={!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(upiId)} onClick={() => setStep('approve')}>Continue to simulated UPI <ArrowNext /></button></div>}
      {method === 'UPI' && step === 'approve' && <div className="upi-approval"><div className="qr-wrap"><QRCodeSVG value={`sharely-test://approve/${encodeURIComponent(order.transaction_id)}`} size={142} level="M" includeMargin /></div><div><strong>Approve simulated UPI payment</strong><p>Scan this test-only code or approve below. It does not initiate a real bank transfer.</p><span className="upi-display">{upiId}</span></div><button className="button button-primary full-width" disabled={busy} onClick={verify}>{busy ? 'Verifying…' : 'I approve this test payment'}</button><button className="text-button" onClick={() => setStep('method')}>Change UPI ID</button></div>}
      {method !== 'UPI' && <div className="gateway-panel"><span className="gateway-icon"><CreditCard size={21} /></span><div><strong>Test {method === 'Card' ? 'card' : 'net banking'} gateway</strong><p>This sandbox flow records a verified test transaction in your booking account. No card or bank credentials are collected.</p></div><button className="button button-primary full-width" disabled={busy} onClick={verify}>{busy ? 'Verifying…' : `Approve ${method === 'Card' ? 'test card' : 'test payment'}`}</button></div>}
      <div className="payment-security"><ShieldCheck size={15} /><span>Booking confirms only after the Flask payment verification response succeeds.</span></div>
    </>}
  </Modal>
}

function ArrowNext() { return <span aria-hidden="true">→</span> }
