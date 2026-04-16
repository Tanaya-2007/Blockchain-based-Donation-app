import { useState } from 'react';

const AMOUNTS = ['500', '1,000', '2,000', '5,000'];
const PAYS = ['📱 UPI', '💳 Card', '🏦 Net Banking'];

export default function DonateModal({ campaign, onClose, onToast }) {
  const [amt, setAmt] = useState('1,000');
  const [pay, setPay] = useState('📱 UPI');
  const [success, setSuccess] = useState(false);

  const handle = () => {
    setSuccess(true);
    onToast('✅ ₹' + amt + ' locked in Polygon smart contract!', 'success');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)',
          background: '#080c1a', padding: '36px', position: 'relative',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '20px',
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
          fontSize: '20px', cursor: 'pointer', lineHeight: 1,
        }}>✕</button>

        {!success ? (
          <>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '22px', fontWeight: 800, color: '#fff',
              marginBottom: '6px',
            }}>Donate Securely</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '28px' }}>
              {campaign?.title || 'Select a campaign'}
            </p>

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
              Select Amount (₹)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
              {AMOUNTS.map(a => (
                <button key={a} onClick={() => setAmt(a)} style={{
                  padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '14px', fontWeight: 700,
                  border: amt === a ? '1px solid rgba(124,58,237,0.8)' : '1px solid rgba(255,255,255,0.1)',
                  background: amt === a ? 'rgba(124,58,237,0.2)' : 'transparent',
                  color: amt === a ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}>₹{a}</button>
              ))}
            </div>
            <input
              placeholder="Custom amount"
              type="number"
              style={{
                width: '100%', padding: '11px 16px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff', fontSize: '14px', outline: 'none',
                boxSizing: 'border-box', marginBottom: '24px',
              }} />

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
              Payment Method
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '24px' }}>
              {PAYS.map(p => (
                <button key={p} onClick={() => setPay(p)} style={{
                  padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 700,
                  border: pay === p ? '1px solid rgba(34,211,238,0.7)' : '1px solid rgba(255,255,255,0.1)',
                  background: pay === p ? 'rgba(34,211,238,0.12)' : 'transparent',
                  color: pay === p ? '#67e8f9' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                }}>{p}</button>
              ))}
            </div>

            <div style={{
              padding: '14px 16px', borderRadius: '12px', marginBottom: '24px',
              border: '1px solid rgba(124,58,237,0.25)',
              background: 'rgba(124,58,237,0.08)',
              fontSize: '12px', color: '#a78bfa', lineHeight: 1.6,
            }}>
              🔒 Your donation goes directly to a smart contract — not to the recipient.
              Funds release only after AI-verified proof.
            </div>

            <button onClick={handle} style={{
              width: '100%', padding: '15px', borderRadius: '12px', border: 'none',
              background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
              color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
              boxShadow: '0 0 24px rgba(124,58,237,0.3)',
            }}>
              Donate ₹{amt} via {pay.split(' ')[1]}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: '2px solid #34d399', background: 'rgba(16,185,129,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px', margin: '0 auto 20px',
            }}>✅</div>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '8px',
            }}>Donation Successful!</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '20px' }}>
              ₹{amt} locked in smart contract on Polygon blockchain
            </p>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
              Transaction Hash
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: '11px', color: '#a78bfa',
              background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
              padding: '12px', marginBottom: '16px',
              border: '1px solid rgba(255,255,255,0.08)', wordBreak: 'break-all',
            }}>
              0x7f4e2a1b9c8d3e6f0a5b2c4d7e9f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6
            </div>
            <div style={{
              fontSize: '12px', color: '#a78bfa', padding: '12px 16px',
              borderRadius: '10px', border: '1px solid rgba(124,58,237,0.25)',
              background: 'rgba(124,58,237,0.08)', marginBottom: '20px',
            }}>
              🔒 Funds locked. Will release after recipient uploads and AI verifies proof.
            </div>
            <button onClick={onClose} style={{
              width: '100%', padding: '13px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.07)',
              color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}