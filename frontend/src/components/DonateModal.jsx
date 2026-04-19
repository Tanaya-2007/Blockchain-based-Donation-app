import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, getDocs,
  increment, query, serverTimestamp,
  updateDoc, where,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const PAYS = [
  { id: 'UPI',        label: '📱 UPI'         },
  { id: 'Card',       label: '💳 Card'         },
  { id: 'NetBanking', label: '🏦 Net Banking'  },
];

export default function DonateModal({ campaign: initialCampaign, onClose, onToast }) {
  const { user } = useAuth();
  const nav = useNavigate();

  /* ── campaign state ── */
  const [campaigns,      setCampaigns]      = useState([]);
  const [selectedCampId, setSelectedCampId] = useState(initialCampaign?.id || '');

  const campaign = initialCampaign
    ? (selectedCampId === initialCampaign.id
        ? initialCampaign
        : campaigns.find(c => c.id === selectedCampId) || initialCampaign)
    : campaigns.find(c => c.id === selectedCampId) || null;

  /* ── amount + payment state ── */
  const [custom,      setCustom]      = useState('');
  const [selectedAmt, setSelectedAmt] = useState('');
  const [pay,         setPay]         = useState('UPI');
  const [saving,      setSaving]      = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [txHash,      setTxHash]      = useState('');
  const [amtErr,      setAmtErr]      = useState('');

  /* ── derived ── */
  const raised    = campaign?.raisedAmount || 0;
  const target    = campaign?.targetAmount || 0;
  const remaining = Math.max(0, target - raised);

  const QUICK_AMOUNTS = [500, 1000, 2000, 5000].filter(a => remaining === 0 || a <= remaining);
  const finalAmt = custom ? Number(custom) : selectedAmt ? Number(selectedAmt) : 0;

  /* ── load active campaigns with remaining > 0 when no pre-selected campaign ── */
  useEffect(() => {
    if (initialCampaign) return;
    getDocs(query(collection(db, 'campaigns'), where('status', '==', 'active'))).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => Math.max(0, (c.targetAmount || 0) - (c.raisedAmount || 0)) > 0);
      setCampaigns(list);
    });
  }, [initialCampaign]);

  /* ── validate amount ── */
  useEffect(() => {
    if (!finalAmt)                            { setAmtErr(''); return; }
    if (finalAmt < 1)                         { setAmtErr('Minimum donation is ₹1'); return; }
    if (remaining > 0 && finalAmt > remaining){ setAmtErr(`Maximum is ₹${remaining.toLocaleString('en-IN')} (remaining goal)`); return; }
    setAmtErr('');
  }, [finalAmt, remaining]);

  const handle = async () => {
    if (!user) { onClose(); nav('/login'); return; }
    if (!campaign?.id)           { onToast('Please select a campaign', 'error'); return; }
    if (!finalAmt || finalAmt < 1){ onToast('Enter a valid amount', 'error'); return; }
    if (amtErr)                  { onToast(amtErr, 'error'); return; }

    setSaving(true);
    try {
      await addDoc(collection(db, 'donations'), {
        donorId:       user.uid,
        donorName:     user.displayName || '',
        donorEmail:    user.email || '',
        campaignId:    campaign.id,
        campaignTitle: campaign.title || '',
        ngoId:         campaign.ngoId || '',
        amount:        finalAmt,
        method:        pay,
        status:        'locked',
        createdAt:     serverTimestamp(),
      });
      await updateDoc(doc(db, 'campaigns', campaign.id), {
        raisedAmount: increment(finalAmt),
        donorCount:   increment(1),
      });
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

  const INP = { width: '100%', padding: '11px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '460px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', background: '#080c1a', padding: '36px', position: 'relative', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', maxHeight: '90vh', overflowY: 'auto' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '20px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '20px', cursor: 'pointer' }}>✕</button>

        {!success ? (
          <>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>Donate Securely</h3>

            {/* Campaign selector — only when no pre-selected campaign */}
            {!initialCampaign ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>Select Campaign</div>
                {campaigns.length === 0 ? (
                  <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
                    No active campaigns with remaining funds right now.
                  </div>
                ) : (
                  <select value={selectedCampId} onChange={e => { setSelectedCampId(e.target.value); setCustom(''); setSelectedAmt(''); setAmtErr(''); }}
                    style={{ ...INP, border: selectedCampId ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.1)', WebkitAppearance: 'none', cursor: 'pointer' }}>
                    <option value="" style={{ background: '#111827' }}>Choose a campaign…</option>
                    {campaigns.map(c => {
                      const rem = Math.max(0, (c.targetAmount || 0) - (c.raisedAmount || 0));
                      return <option key={c.id} value={c.id} style={{ background: '#111827' }}>{c.title} — ₹{rem.toLocaleString('en-IN')} remaining</option>;
                    })}
                  </select>
                )}
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '16px' }}>{campaign?.title}</p>
            )}

            {/* Goal / raised / remaining info */}
            {campaign && remaining > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(34,211,238,0.25)', background: 'rgba(34,211,238,0.06)', fontSize: '12px', color: '#67e8f9', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span>🎯 Goal: <strong>₹{target.toLocaleString('en-IN')}</strong></span>
                <span>💰 Raised: <strong>₹{raised.toLocaleString('en-IN')}</strong></span>
                <span>⏳ Left: <strong>₹{remaining.toLocaleString('en-IN')}</strong></span>
              </div>
            )}
            {campaign && remaining === 0 && target > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', fontSize: '13px', color: '#6ee7b7', textAlign: 'center' }}>
                🎉 This campaign has reached its goal!
              </div>
            )}

            {/* Quick-select amounts */}
            {QUICK_AMOUNTS.length > 0 && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>Quick Select (₹)</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${QUICK_AMOUNTS.length},1fr)`, gap: '8px', marginBottom: '16px' }}>
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} onClick={() => { setSelectedAmt(String(a)); setCustom(''); setAmtErr(''); }}
                      style={{ padding: '11px 0', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, transition: 'all 0.15s', border: selectedAmt === String(a) && !custom ? '1px solid rgba(124,58,237,0.8)' : '1px solid rgba(255,255,255,0.1)', background: selectedAmt === String(a) && !custom ? 'rgba(124,58,237,0.2)' : 'transparent', color: selectedAmt === String(a) && !custom ? '#c4b5fd' : 'rgba(255,255,255,0.45)' }}>
                      ₹{a.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Custom amount */}
            <div style={{ marginBottom: amtErr ? '6px' : '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>Custom Amount (₹)</div>
              <input placeholder={remaining > 0 ? `Enter amount (max ₹${remaining.toLocaleString('en-IN')})` : 'Enter amount'} type="number" min="1" max={remaining > 0 ? remaining : undefined}
                value={custom} onChange={e => { setCustom(e.target.value); setSelectedAmt(''); }}
                style={{ ...INP, border: amtErr ? '1px solid rgba(239,68,68,0.6)' : custom ? '1px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            {amtErr && (
              <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '16px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>⚠ {amtErr}</div>
            )}

            {/* Payment method */}
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>Payment Method</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '24px' }}>
              {PAYS.map(p => (
                <button key={p.id} onClick={() => setPay(p.id)} style={{ padding: '11px 0', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, transition: 'all 0.15s', border: pay === p.id ? '1px solid rgba(34,211,238,0.7)' : '1px solid rgba(255,255,255,0.1)', background: pay === p.id ? 'rgba(34,211,238,0.12)' : 'transparent', color: pay === p.id ? '#67e8f9' : 'rgba(255,255,255,0.4)' }}>{p.label}</button>
              ))}
            </div>

            <div style={{ padding: '14px 16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)', fontSize: '12px', color: '#a78bfa', lineHeight: 1.6 }}>
              🔒 Your donation is locked until the NGO uploads AI-verified milestone proof. Funds release only after verification passes.
            </div>

            <button onClick={handle} disabled={saving}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: saving ? 'rgba(124,58,237,0.35)' : 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 0 24px rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {saving ? (
                <><span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />Processing…</>
              ) : !user
                ? '🔑 Sign in to Donate'
                : finalAmt > 0
                  ? `Donate ₹${finalAmt.toLocaleString('en-IN')} via ${pay}`
                  : 'Enter an amount to donate'}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: '2px solid #34d399', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 20px' }}>✅</div>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Donation Recorded!</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '20px' }}>₹{finalAmt.toLocaleString('en-IN')} locked — releases after AI-verified milestone proof</p>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>Transaction Reference</div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#a78bfa', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.08)', wordBreak: 'break-all' }}>{txHash}</div>
            <div style={{ fontSize: '12px', color: '#a78bfa', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)', marginBottom: '20px', lineHeight: 1.6 }}>🔒 Funds locked. Will release after NGO uploads proof and AI verifies it.</div>
            <button onClick={onClose} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>Done</button>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}