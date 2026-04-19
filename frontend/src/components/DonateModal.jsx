import { useState } from 'react';
import {
  addDoc, collection, doc, increment,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const AMOUNTS = ['500', '1000', '2000', '5000'];
const PAYS    = [{ id: 'UPI', label: '📱 UPI' }, { id: 'Card', label: '💳 Card' }, { id: 'NetBanking', label: '🏦 Net Banking' }];

export default function DonateModal({ campaign, onClose, onToast }) {
  const { user } = useAuth();

  const [amt,     setAmt]     = useState('1000');
  const [custom,  setCustom]  = useState('');
  const [pay,     setPay]     = useState('UPI');
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [txHash,  setTxHash]  = useState('');

  const finalAmt = Number(custom || amt);

  const handle = async () => {
    if (!user) { onToast('Please sign in to donate', 'error'); return; }
    if (!campaign?.id) { onToast('Invalid campaign', 'error'); return; }
    if (!finalAmt || finalAmt < 1) { onToast('Enter a valid amount', 'error'); return; }

    setSaving(true);
    try {
      // 1. Record donation in Firestore
      await addDoc(collection(db, 'donations'), {
        donorId:    user.uid,
        donorName:  user.displayName || '',
        donorEmail: user.email || '',
        campaignId: campaign.id,
        campaignTitle: campaign.title || '',
        ngoId:      campaign.ngoId || '',
        amount:     finalAmt,
        method:     pay,
        status:     'locked',          // funds locked until milestone verified
        createdAt:  serverTimestamp(),
      });

      // 2. Update campaign raisedAmount and donorCount atomically
      await updateDoc(doc(db, 'campaigns', campaign.id), {
        raisedAmount: increment(finalAmt),
        donorCount:   increment(1),
      });

      // 3. Simulate a tx hash (replace with real Razorpay/UPI integration later)
      const fakeTx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setTxHash(fakeTx);
      setSuccess(true);
      onToast(`✅ ₹${finalAmt.toLocaleString('en-IN')} locked — milestone verified before release`, 'success');
    } catch (e) {
      onToast('Donation failed: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '440px',
        borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#080c1a', padding: '36px', position: 'relative',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '20px',
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
          fontSize: '20px', cursor: 'pointer',
        }}>✕</button>

        {!success ? (
          <>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
              Donate Securely
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '28px' }}>
              {campaign?.title || 'Select a campaign'}
            </p>

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
              Select Amount (₹)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
              {AMOUNTS.map(a => (
                <button key={a} onClick={() => { setAmt(a); setCustom(''); }} style={{
                  padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '14px', fontWeight: 700,
                  border: amt === a && !custom ? '1px solid rgba(124,58,237,0.8)' : '1px solid rgba(255,255,255,0.1)',
                  background: amt === a && !custom ? 'rgba(124,58,237,0.2)' : 'transparent',
                  color: amt === a && !custom ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}>₹{Number(a).toLocaleString('en-IN')}</button>
              ))}
            </div>
            <input
              placeholder="Custom amount"
              type="number"
              min="1"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: '10px',
                border: custom ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: '#fff',
                fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '24px',
              }} />

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
              Payment Method
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '24px' }}>
              {PAYS.map(p => (
                <button key={p.id} onClick={() => setPay(p.id)} style={{
                  padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 700,
                  border: pay === p.id ? '1px solid rgba(34,211,238,0.7)' : '1px solid rgba(255,255,255,0.1)',
                  background: pay === p.id ? 'rgba(34,211,238,0.12)' : 'transparent',
                  color: pay === p.id ? '#67e8f9' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                }}>{p.label}</button>
              ))}
            </div>

            <div style={{ padding: '14px 16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)', fontSize: '12px', color: '#a78bfa', lineHeight: 1.6 }}>
              🔒 Your donation is locked until the NGO uploads AI-verified milestone proof. Funds release only after verification passes.
            </div>

            <button onClick={handle} disabled={saving || finalAmt < 1} style={{
              width: '100%', padding: '15px', borderRadius: '12px', border: 'none',
              background: saving ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg,#7c3aed,#0891b2)',
              color: '#fff', fontWeight: 700, fontSize: '15px',
              cursor: saving || finalAmt < 1 ? 'not-allowed' : 'pointer',
              boxShadow: '0 0 24px rgba(124,58,237,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              {saving ? (
                <>
                  <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  Processing…
                </>
              ) : `Donate ₹${finalAmt.toLocaleString('en-IN')} via ${pay}`}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: '2px solid #34d399', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 20px' }}>✅</div>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              Donation Recorded!
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '20px' }}>
              ₹{finalAmt.toLocaleString('en-IN')} locked — releases after AI-verified milestone proof
            </p>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
              Transaction Reference
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#a78bfa', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.08)', wordBreak: 'break-all' }}>
              {txHash}
            </div>
            <div style={{ fontSize: '12px', color: '#a78bfa', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)', marginBottom: '20px', lineHeight: 1.6 }}>
              🔒 Funds locked. Will release after NGO uploads proof and AI verifies it.
            </div>
            <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}