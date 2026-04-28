import { useEffect, useState } from 'react';
import {
  collection, doc, getDocs, updateDoc,
  onSnapshot, query, serverTimestamp,
  where, writeBatch, increment,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const PAYS = [
  { id:'UPI',        label:'📱 UPI'        },
  { id:'Card',       label:'💳 Card'        },
  { id:'NetBanking', label:'🏦 Net Banking' },
];

function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function DonateModal({ campaign: initialCampaign, onClose, onToast }) {
  const { user } = useAuth();
  const nav = useNavigate();

  const [liveCampaign,   setLiveCampaign]   = useState(initialCampaign || null);
  const [campaigns,      setCampaigns]      = useState([]);
  const [selectedCampId, setSelectedCampId] = useState(initialCampaign?.id || '');
  const [custom,         setCustom]         = useState('');
  const [selectedAmt,    setSelectedAmt]    = useState('');
  const [pay,            setPay]            = useState('UPI');
  const [processing,     setProcessing]     = useState(false);
  const [success,        setSuccess]        = useState(false);
  const [txHash,         setTxHash]         = useState('');   // Razorpay payment ID
  const [savedDonationId, setSavedDonationId] = useState(null);
  const [bchainStatus,   setBchainStatus]   = useState('queued_for_chain_sync');
  const [bchainTxHash,   setBchainTxHash]   = useState('');
  const [amtErr,         setAmtErr]         = useState('');

  const campaign  = liveCampaign;
  const raised    = liveCampaign?.raisedAmount  || 0;
  const target    = liveCampaign?.targetAmount  || 0;
  const remaining = Math.max(0, target - raised);
  const isGoalMet = target > 0 && remaining === 0;
  const QUICK_AMOUNTS = [500, 1000, 2000, 5000].filter(a => remaining === 0 || a <= remaining);
  const finalAmt = custom ? Number(custom) : selectedAmt ? Number(selectedAmt) : 0;

  /* ── realtime campaign listener ── */
  useEffect(() => {
    if (!initialCampaign?.id) return;
    return onSnapshot(doc(db, 'campaigns', initialCampaign.id),
      snap => { if (snap.exists()) setLiveCampaign({ id: snap.id, ...snap.data() }); }
    );
  }, [initialCampaign?.id]);

  useEffect(() => {
    if (initialCampaign) return;
    getDocs(query(collection(db, 'campaigns'), where('status', '==', 'active'))).then(snap => {
      setCampaigns(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => Math.max(0, (c.targetAmount||0) - (c.raisedAmount||0)) > 0)
      );
    });
  }, [initialCampaign]);

  useEffect(() => {
    if (!selectedCampId || initialCampaign) return;
    return onSnapshot(doc(db, 'campaigns', selectedCampId),
      snap => { if (snap.exists()) setLiveCampaign({ id: snap.id, ...snap.data() }); }
    );
  }, [selectedCampId, initialCampaign]);

  /* ── amount validation ── */
  useEffect(() => {
    if (!finalAmt)                             { setAmtErr(''); return; }
    if (finalAmt < 1)                          { setAmtErr('Minimum ₹1'); return; }
    if (remaining > 0 && finalAmt > remaining) { setAmtErr(`Max ₹${remaining.toLocaleString('en-IN')}`); return; }
    setAmtErr('');
  }, [finalAmt, remaining]);

  /* ── atomic Firestore batch write ── */
  const saveDonation = async ({ paymentId, orderId }) => {
    const batch = writeBatch(db);

    const donationRef = doc(collection(db, 'donations'));
    const generatedId = donationRef.id;

    batch.set(donationRef, {
      donorId:           user.uid,
      donorName:         user.displayName || '',
      donorEmail:        user.email       || '',
      campaignId:        campaign.id,
      campaignTitle:     campaign.title   || '',
      ngoId:             campaign.ngoId   || '',
      amount:            finalAmt,
      method:            pay,
      status:            'payment_success',
      blockchainStatus:  'queued_for_chain_sync',
      razorpayPaymentId: paymentId       || null,
      razorpayOrderId:   orderId         || null,
      blockchainTxHash:  null,
      createdAt:         serverTimestamp(),
    });

    const campaignRef = doc(db, 'campaigns', campaign.id);
    batch.update(campaignRef, {
      raisedAmount: increment(finalAmt),
      donorCount:   increment(1),
    });

    const ledgerRef = doc(collection(db, 'ledger'));
    const ledgerId = ledgerRef.id;
    batch.set(ledgerRef, {
      type:             'donation',
      campaignId:       campaign.id,
      campaignTitle:    campaign.title || '',
      donorId:          user.uid,
      donorName:        user.displayName || '',
      amount:           finalAmt,
      paymentId:        paymentId       || null,
      blockchainStatus: 'queued_for_chain_sync',
      blockchainTxHash: null,
      createdAt:        serverTimestamp(),
    });

    await batch.commit();
    return { generatedId, ledgerId };
  };

  /* ── main payment handler ── */
  const handle = async () => {
    if (!user)                     { onClose(); nav('/login'); return; }
    if (isGoalMet)                 { onToast('Campaign has reached its goal!', 'error'); return; }
    if (!campaign?.id)             { onToast('Please select a campaign', 'error'); return; }
    if (!finalAmt || finalAmt < 1) { onToast('Enter a valid amount', 'error'); return; }
    if (amtErr)                    { onToast(amtErr, 'error'); return; }

    setProcessing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Razorpay script failed to load. Check your internet connection.');

      /* Step 1 — create Razorpay order on backend */
      const orderRes = await fetch(`${BACKEND}/api/payment/create-order`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: finalAmt, campaignId: campaign.id, campaignTitle: campaign.title }),
      });
      if (!orderRes.ok) {
        const e = await orderRes.json();
        throw new Error(e.error || 'Order creation failed');
      }
      const order = await orderRes.json();

      /* Step 2 — open Razorpay checkout */
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key:         order.keyId,
          amount:      order.amount,
          currency:    order.currency,
          name:        'TransparentFund',
          description: campaign.title || 'Donation',
          order_id:    order.orderId,
          prefill:     { name: user.displayName || '', email: user.email || '' },
          theme:       { color: '#7c3aed' },
          modal: {
            ondismiss: () => {
              setProcessing(false);
              onToast('Payment cancelled', 'warning');
              reject(new Error('cancelled'));
            },
          },
          handler: async (response) => {
            try {
              /* Step 3 — verify Razorpay signature */
              const verifyRes = await fetch(`${BACKEND}/api/payment/verify`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  razorpay_order_id:   response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature:  response.razorpay_signature,
                }),
              });
              const verify = await verifyRes.json();
              if (!verify.verified) throw new Error('Payment signature verification failed');

              // Razorpay succeeded — show success screen immediately
              setTxHash(response.razorpay_payment_id);
              setSuccess(true);
              setBchainStatus('queued_for_chain_sync');

              /* Step 4 — save to Firestore instantly */
              const { generatedId, ledgerId } = await saveDonation({
                paymentId:   response.razorpay_payment_id,
                orderId:     response.razorpay_order_id,
              });
              setSavedDonationId(generatedId);
              
              // Trigger background sync async, but wait for it to update UI
              fetch(`${BACKEND}/api/onchain/queue-donation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donationId: generatedId, amount: finalAmt })
              }).then(res => res.json()).then(async (data) => {
                if (data.success && data.txHash) {
                  // Backend synced successfully! Update Firestore and UI
                  setBchainStatus('done');
                  setBchainTxHash(data.txHash);
                  const batch = writeBatch(db);
                  batch.update(doc(db, 'donations', generatedId), { blockchainStatus: 'done', blockchainTxHash: data.txHash });
                  batch.update(doc(db, 'ledger', ledgerId), { blockchainStatus: 'done', blockchainTxHash: data.txHash });
                  await batch.commit();
                }
              }).catch(e => console.log('Background queue endpoint not ready yet, graceful fallback active'));

              onToast(`✅ ₹${finalAmt.toLocaleString('en-IN')} donated — locked until milestone verified`, 'success');
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });
        rzp.on('payment.failed', resp =>
          reject(new Error(resp.error?.description || 'Payment failed at Razorpay'))
        );
        rzp.open();
      });

    } catch (e) {
      if (e.message !== 'cancelled') {
        console.error('[DonateModal] Payment error:', e);
        onToast('Payment failed: ' + e.message, 'error');
      }
    } finally {
      setProcessing(false);
    }
  };

  const INP = {
    width:'100%', padding:'11px 16px', borderRadius:'10px',
    background:'rgba(255,255,255,0.04)', color:'#fff',
    fontSize:'14px', outline:'none', boxSizing:'border-box',
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', background:'rgba(0,0,0,0.8)', backdropFilter:'blur(12px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth:'460px', borderRadius:'24px', border:'1px solid rgba(255,255,255,0.08)', background:'#080c1a', padding:'36px', position:'relative', boxShadow:'0 32px 80px rgba(0,0,0,0.6)', maxHeight:'90vh', overflowY:'auto' }}>
        <button onClick={onClose} style={{ position:'absolute', top:'16px', right:'20px', background:'none', border:'none', color:'rgba(255,255,255,0.35)', fontSize:'20px', cursor:'pointer' }}>✕</button>

        {!success ? (
          <>
            <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'22px', fontWeight:800, color:'#fff', marginBottom:'6px' }}>Donate Securely</h3>

            {/* Campaign selector */}
            {!initialCampaign ? (
              <div style={{ marginBottom:'20px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'8px' }}>Select Campaign</div>
                {campaigns.length === 0
                  ? <div style={{ padding:'12px 14px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', fontSize:'13px', color:'rgba(255,255,255,0.3)' }}>No active campaigns right now.</div>
                  : <select value={selectedCampId} onChange={e => { setSelectedCampId(e.target.value); setCustom(''); setSelectedAmt(''); setAmtErr(''); setLiveCampaign(null); }}
                      style={{ ...INP, border: selectedCampId ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.1)', WebkitAppearance:'none', cursor:'pointer' }}>
                      <option value="" style={{ background:'#111827' }}>Choose a campaign…</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id} style={{ background:'#111827' }}>
                          {c.title} — ₹{Math.max(0,(c.targetAmount||0)-(c.raisedAmount||0)).toLocaleString('en-IN')} left
                        </option>
                      ))}
                    </select>
                }
              </div>
            ) : (
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'16px' }}>{liveCampaign?.title}</p>
            )}

            {/* Campaign stats */}
            {campaign && remaining > 0 && (
              <div style={{ padding:'10px 14px', borderRadius:'10px', marginBottom:'20px', border:'1px solid rgba(34,211,238,0.25)', background:'rgba(34,211,238,0.06)', fontSize:'12px', color:'#67e8f9', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'6px' }}>
                <span>🎯 Goal: <strong>₹{target.toLocaleString('en-IN')}</strong></span>
                <span>💰 Raised: <strong>₹{raised.toLocaleString('en-IN')}</strong></span>
                <span>⏳ Left: <strong>₹{remaining.toLocaleString('en-IN')}</strong></span>
              </div>
            )}
            {campaign && isGoalMet && (
              <div style={{ padding:'10px 14px', borderRadius:'10px', marginBottom:'20px', border:'1px solid rgba(16,185,129,0.35)', background:'rgba(16,185,129,0.08)', fontSize:'13px', color:'#6ee7b7', textAlign:'center' }}>
                🎉 This campaign has reached its goal!
              </div>
            )}

            {/* Quick amounts */}
            {!isGoalMet && QUICK_AMOUNTS.length > 0 && (
              <>
                <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'10px' }}>Quick Select (₹)</div>
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${QUICK_AMOUNTS.length},1fr)`, gap:'8px', marginBottom:'16px' }}>
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} onClick={() => { setSelectedAmt(String(a)); setCustom(''); setAmtErr(''); }}
                      style={{ padding:'11px 0', borderRadius:'10px', cursor:'pointer', fontSize:'13px', fontWeight:700,
                        border:     selectedAmt===String(a)&&!custom ? '1px solid rgba(124,58,237,0.8)' : '1px solid rgba(255,255,255,0.1)',
                        background: selectedAmt===String(a)&&!custom ? 'rgba(124,58,237,0.2)' : 'transparent',
                        color:      selectedAmt===String(a)&&!custom ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                      }}>
                      ₹{a.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Custom amount */}
            {!isGoalMet && (
              <>
                <div style={{ marginBottom: amtErr ? '6px' : '20px' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'8px' }}>Custom Amount (₹)</div>
                  <input placeholder={remaining > 0 ? `Max ₹${remaining.toLocaleString('en-IN')}` : 'Enter amount'}
                    type="number" min="1" value={custom}
                    onChange={e => { setCustom(e.target.value); setSelectedAmt(''); }}
                    style={{ ...INP, border: amtErr ? '1px solid rgba(239,68,68,0.6)' : custom ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                {amtErr && (
                  <div style={{ fontSize:'12px', color:'#f87171', marginBottom:'16px', padding:'8px 12px', borderRadius:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
                    ⚠ {amtErr}
                  </div>
                )}
              </>
            )}

            {/* Payment method */}
            {!isGoalMet && (
              <>
                <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'10px' }}>Payment Method</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'24px' }}>
                  {PAYS.map(p => (
                    <button key={p.id} onClick={() => setPay(p.id)}
                      style={{ padding:'11px 0', borderRadius:'10px', cursor:'pointer', fontSize:'12px', fontWeight:700,
                        border:     pay===p.id ? '1px solid rgba(34,211,238,0.7)' : '1px solid rgba(255,255,255,0.1)',
                        background: pay===p.id ? 'rgba(34,211,238,0.12)' : 'transparent',
                        color:      pay===p.id ? '#67e8f9' : 'rgba(255,255,255,0.4)',
                      }}>{p.label}</button>
                  ))}
                </div>
              </>
            )}

            {/* Security note */}
            {!isGoalMet && (
              <div style={{ padding:'14px 16px', borderRadius:'12px', marginBottom:'24px', border:'1px solid rgba(124,58,237,0.25)', background:'rgba(124,58,237,0.08)', fontSize:'12px', color:'#a78bfa', lineHeight:1.6 }}>
                🔒 Secured by Razorpay. Funds locked until AI-verified milestone proof is approved. Donation queued for backend blockchain sync.
              </div>
            )}

            {/* CTA button */}
            <button onClick={handle} disabled={processing || isGoalMet}
              style={{ width:'100%', padding:'15px', borderRadius:'12px',
                border:     isGoalMet ? '1px solid rgba(16,185,129,0.3)' : 'none',
                background: isGoalMet ? 'rgba(16,185,129,0.2)' : processing ? 'rgba(124,58,237,0.35)' : 'linear-gradient(135deg,#7c3aed,#0891b2)',
                color:      isGoalMet ? '#6ee7b7' : '#fff',
                fontWeight:700, fontSize:'15px',
                cursor: processing || isGoalMet ? 'not-allowed' : 'pointer',
                boxShadow: isGoalMet ? 'none' : '0 0 24px rgba(124,58,237,0.3)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
              }}>
              {processing
                ? <><span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />Opening payment…</>
                : isGoalMet    ? '🎉 Goal Reached — Donations Closed'
                : !user        ? '🔑 Sign in to Donate'
                : finalAmt > 0 ? `Pay ₹${finalAmt.toLocaleString('en-IN')} via Razorpay`
                : 'Enter an amount to donate'}
            </button>
          </>
        ) : (
          /* ── Success screen ── */
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{ width:'72px', height:'72px', borderRadius:'50%', border:'2px solid #34d399', background:'rgba(16,185,129,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'32px', margin:'0 auto 20px' }}>
              ✅
            </div>
            <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'22px', fontWeight:800, color:'#fff', marginBottom:'8px' }}>Payment Successful!</h3>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'20px' }}>
              ₹{finalAmt.toLocaleString('en-IN')} locked — releases after AI-verified milestone proof
            </p>

            {/* Badges container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '12px', fontWeight: 700 }}>
                Payment Verified ✅
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', fontSize: '12px', fontWeight: 700 }}>
                Transparency Recorded ✅
              </div>
              
              {bchainStatus === 'queued_for_chain_sync' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d', fontSize: '12px', fontWeight: 700 }}>
                  <span style={{ width:'12px', height:'12px', border:'2px solid rgba(245,158,11,0.3)', borderTopColor:'#fcd34d', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
                  Blockchain Sync Pending ⏳
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', fontSize: '12px', fontWeight: 700 }}>
                    Synced to Polygon ✅
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    Tx: {bchainTxHash.slice(0, 10)}...{bchainTxHash.slice(-8)}
                  </div>
                </div>
              )}
            </div>

            {/* Razorpay payment ID */}
            <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'8px' }}>Razorpay Receipt ID</div>
            <div style={{ fontFamily:'monospace', fontSize:'11px', color:'#a78bfa', background:'rgba(255,255,255,0.04)', borderRadius:'10px', padding:'12px', marginBottom:'16px', border:'1px solid rgba(255,255,255,0.08)', wordBreak:'break-all' }}>
              {txHash}
            </div>

            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', marginBottom:'20px', lineHeight: 1.5 }}>
              Your donation is secured. Our backend treasury will automatically sync this transaction to the Polygon blockchain without requiring any gas fees or MetaMask from you.
            </div>

            <button onClick={onClose} style={{ width:'100%', padding:'13px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.07)', color:'#fff', fontWeight:700, fontSize:'14px', cursor:'pointer', transition: 'background 0.2s' }}
              onMouseEnter={e => e.target.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.target.style.background='rgba(255,255,255,0.07)'}>
              Done
            </button>
          </div>
        )}

        <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}