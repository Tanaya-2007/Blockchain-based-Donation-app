import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Module-level constant — computed once when file loads, never during render
const NOW = Date.now();

const FILTERS = ['All', 'Medical / Healthcare', 'Education', 'Disaster Relief', 'Environmental', 'Child Welfare'];
const KEYS    = ['all', 'Medical / Healthcare', 'Education', 'Disaster Relief', 'Environmental', 'Child Welfare'];

const CAT_EMOJI = {
  'Medical / Healthcare': '🏥', 'Education': '📚', 'Disaster Relief': '🆘',
  'Environmental': '🌱', 'Child Welfare': '👶', 'Women Empowerment': '💜',
  'Animal Welfare': '🐾', 'Community Development': '🤝', 'Other': '💡',
};
const CAT_GRAD = {
  'Medical / Healthcare': 'linear-gradient(135deg,#1e0840 0%,#2d1052 100%)',
  'Education':            'linear-gradient(135deg,#1a1a05 0%,#2d2d0f 100%)',
  'Disaster Relief':      'linear-gradient(135deg,#200505 0%,#3a1010 100%)',
  'Environmental':        'linear-gradient(135deg,#032005 0%,#0d3a10 100%)',
  'Child Welfare':        'linear-gradient(135deg,#01132a 0%,#052040 100%)',
  'Women Empowerment':    'linear-gradient(135deg,#1a0524 0%,#2d0f40 100%)',
  'Animal Welfare':       'linear-gradient(135deg,#1a1000 0%,#2d2000 100%)',
  'Other':                'linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 100%)',
};

/* ─── Deadline-Today Urgency Popup ───────────────────── */
function DeadlinePopup({ campaign, onClose, onDonate }) {
  const raised  = campaign.raisedAmount  || 0;
  const target  = campaign.targetAmount  || 0;
  const remaining = Math.max(0, target - raised);
  const pct     = target ? Math.min(Math.round((raised / target) * 100), 100) : 0;
  const emoji   = CAT_EMOJI[campaign.category] || '💡';

  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          borderRadius: '24px',
          border: '1px solid rgba(239,68,68,0.5)',
          background: 'linear-gradient(145deg, #1a0505, #0d1021)',
          padding: '36px',
          boxShadow: '0 0 60px rgba(239,68,68,0.2), 0 32px 80px rgba(0,0,0,0.6)',
          animation: 'popupIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '20px',
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.3)', fontSize: '20px',
            cursor: 'pointer', lineHeight: 1,
          }}
        >✕</button>

        {/* Pulsing urgency badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
            background: 'rgba(239,68,68,0.2)', color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.5)',
          }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: '#ef4444', display: 'inline-block',
              animation: 'pulse 1.2s ease-in-out infinite',
            }} />
            ENDS TODAY
          </span>
        </div>

        {/* Campaign emoji + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            overflow: 'hidden',
          }}>
            {campaign.imageUrl
              ? <img src={campaign.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : emoji}
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '5px' }}>
              {campaign.category}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              {campaign.title}
            </div>
          </div>
        </div>

        {/* Urgency message */}
        <div style={{
          padding: '14px 16px', borderRadius: '12px', marginBottom: '20px',
          border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)',
          fontSize: '13px', color: '#fca5a5', lineHeight: 1.65,
        }}>
          ⏰ <strong style={{ color: '#fff' }}>This is the last day to donate.</strong> Once the deadline passes,
          this campaign will close and no further contributions will be accepted.
          Every rupee you donate today is still milestone-locked until verified.
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '6px' }}>
            <span><strong style={{ color: '#fff' }}>₹{raised.toLocaleString('en-IN')}</strong> (~${Math.round(raised / 83)} USDC) raised</span>
            <strong style={{ color: pct >= 100 ? '#34d399' : '#fca5a5' }}>{pct}%</strong>
          </div>
          <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '6px' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: '6px',
              background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f97316)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          {remaining > 0 && (
            <div style={{ fontSize: '11px', color: '#fcd34d', fontWeight: 600 }}>
              ₹{remaining.toLocaleString('en-IN')} (~${Math.round(remaining / 83)} USDC) still needed to reach the goal
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { onClose(); onDonate(campaign); }}
            style={{
              flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
              background: 'linear-gradient(135deg,#ef4444,#dc2626)',
              color: '#fff', fontWeight: 700, fontSize: '15px',
              cursor: 'pointer',
              boxShadow: '0 0 24px rgba(239,68,68,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            ❤️ Donate Before It Ends
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '14px 18px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      </div>

      <style>{`
        @keyframes popupIn {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

/* ─── Main Campaigns Component ───────────────────────── */
export default function Campaigns({ onDonate }) {
  const [campaigns,       setCampaigns]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState('all');
  const [hovered,         setHovered]         = useState(null);
  const [error,           setError]           = useState('');
  const [deadlinePopup,   setDeadlinePopup]   = useState(null); // campaign object or null

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const snap = await getDocs(query(collection(db, 'campaigns'), where('status', '==', 'active')));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

        // Auto-heal corrupted campaigns where released > raised
        import('firebase/firestore').then(({ doc, updateDoc }) => {
          list.forEach(c => {
            if ((c.releasedFunds || 0) > (c.raisedAmount || 0)) {
              updateDoc(doc(db, 'campaigns', c.id), { raisedAmount: c.releasedFunds || 0 }).catch(console.error);
              c.raisedAmount = c.releasedFunds || 0;
            }
          });
        });

        setCampaigns(list);
      } catch (e) { console.error(e); setError(e.message); }
      setLoading(false);
    })();
  }, []);

  /* Intercept clicks — show urgency popup if deadline is today */
  const handleCardClick = (campaign, daysLeft) => {
    if (daysLeft === 0) {
      setDeadlinePopup(campaign);
    } else {
      onDonate({ ...campaign });
    }
  };

  const shown = filter === 'all' ? campaigns : campaigns.filter(c => c.category === filter);

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>

      {/* Deadline urgency popup */}
      {deadlinePopup && (
        <DeadlinePopup
          campaign={deadlinePopup}
          onClose={() => setDeadlinePopup(null)}
          onDonate={c => onDonate({ ...c })}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '30px', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', marginBottom: '6px' }}>Active Campaigns</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>All campaigns verified · Funds milestone-locked</p>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {FILTERS.map((f, i) => (
          <button key={f} onClick={() => setFilter(KEYS[i])} style={{
            padding: '7px 18px', borderRadius: '999px', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
            border: filter === KEYS[i] ? '1px solid rgba(124,58,237,0.7)' : '1px solid rgba(255,255,255,0.1)',
            background: filter === KEYS[i] ? 'rgba(124,58,237,0.2)' : 'transparent',
            color: filter === KEYS[i] ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
          }}>{f}</button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '14px 16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.07)', fontSize: '13px', color: '#fca5a5' }}>
          ⚠ Could not load campaigns: {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {[1, 2, 3].map(i => <div key={i} style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.07)', background: '#0d1021', height: '380px', opacity: 0.5 }} />)}
        </div>
      )}

      {!loading && shown.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>
            {filter === 'all' ? 'No campaigns yet' : `No ${filter} campaigns`}
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
            {filter === 'all' ? 'Approved NGOs can create campaigns from their dashboard.' : 'Try a different category filter.'}
          </p>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {shown.map(c => {
            const raised    = c.raisedAmount || 0;
            const released  = c.releasedFunds || 0;
            const locked    = Math.max(0, raised - released);
            const target    = c.targetAmount || 0;
            const remaining = Math.max(0, target - raised);
            const pct       = target ? Math.min(Math.round((raised / target) * 100), 100) : 0;
            const isGoalMet = target > 0 && remaining === 0;
            const isHov     = hovered === c.id;
            const emoji     = CAT_EMOJI[c.category] || '💡';
            const grad      = CAT_GRAD[c.category]  || CAT_GRAD.Other;
            const daysLeft  = c.deadline?.seconds
              ? Math.max(0, Math.ceil((c.deadline.seconds * 1000 - NOW) / 86400000))
              : null;

            const endsToday = daysLeft === 0;

            return (
              <div key={c.id}
                onClick={() => handleCardClick({ ...c }, daysLeft)}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  borderRadius: '20px',
                  border: isHov
                    ? '1px solid rgba(124,58,237,0.5)'
                    : '1px solid rgba(255,255,255,0.07)',
                  overflow: 'hidden', cursor: 'pointer', background: '#0d1021',
                  transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isHov
  ? '0 16px 48px rgba(0,0,0,0.5)'
  : 'none',
                  transition: 'all 0.25s ease',
                }}>

                {/* Banner */}
                <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: grad, overflow: 'hidden' }}>
                  {c.imageUrl
                    ? <img src={c.imageUrl} alt={c.title} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    : <span style={{ fontSize: '56px' }}>{emoji}</span>}

                  <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>
                    ✓ Verified
                  </span>

                  {daysLeft !== null && (
                    <span style={{
                      position: 'absolute', bottom: '12px', left: '12px',
                      fontSize: '10px', fontWeight: 700, padding: '3px 9px',
                      borderRadius: '999px',
                      border: endsToday ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.2)',
                      background: endsToday ? 'rgba(239,68,68,0.35)' : 'rgba(0,0,0,0.5)',
                      color: endsToday ? '#fff' : daysLeft <= 3 ? '#fca5a5' : 'rgba(255,255,255,0.7)',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}>
                      {endsToday && (
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: '#ef4444', display: 'inline-block',
                          animation: 'pulse 1.2s ease-in-out infinite',
                        }} />
                      )}
                      {endsToday ? 'Ends Today' : `${daysLeft}d left`}
                    </span>
                  )}
                </div>

                <div style={{ padding: '20px 22px 22px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
                    {c.category}
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px', color: '#fff', marginBottom: '8px', lineHeight: 1.35 }}>
                    {c.title}
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '12px', lineHeight: 1.65, marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {c.description}
                  </p>

                  {/* Progress */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                    <span><strong style={{ color: '#fff' }}>₹{raised.toLocaleString('en-IN')}</strong> (~${Math.round(raised / 83)} USDC)</span>
                    <strong style={{ color: pct >= 100 ? '#34d399' : '#fff' }}>{pct}%</strong>
                  </div>
                  <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', marginBottom: '8px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#7c3aed,#0891b2)' }} />
                  </div>

                  {/* Blockchain Funds Info */}
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '14px 0', padding: '10px 14px', background: 'rgba(124,58,237,0.05)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fcd34d' }}>₹{locked.toLocaleString('en-IN')}<br/><span style={{ fontSize:'9px', opacity:0.75 }}>~${Math.round(locked / 83)} USDC</span></div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.5px', marginTop: '3px' }}>LOCKED (CHAIN)</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#6ee7b7' }}>₹{released.toLocaleString('en-IN')}<br/><span style={{ fontSize:'9px', opacity:0.75 }}>~${Math.round(released / 83)} USDC</span></div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.5px', marginTop: '3px' }}>RELEASED (CHAIN)</div>
                    </div>
                  </div>

                  {/* Goal + remaining */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '3px' }}>
                      Goal: ₹{target.toLocaleString('en-IN')} (~${Math.round(target / 83)} USDC) · {c.donorCount || 0} donor{c.donorCount !== 1 ? 's' : ''}
                    </div>
                    {isGoalMet ? (
                      <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>🎉 Goal reached!</div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#22d3ee', fontWeight: 600 }}>
                        ₹{remaining.toLocaleString('en-IN')} (~${Math.round(remaining / 83)} USDC) still needed
                      </div>
                    )}
                  </div>

                  {/* Bottom row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22d3ee', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        M{c.currentMilestone || 1} of {c.milestones?.length || '?'}
                      </span>
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (endsToday && !isGoalMet) { setDeadlinePopup({ ...c }); }
                        else if (!isGoalMet) { onDonate({ ...c }); }
                      }}
                      disabled={isGoalMet}
                      style={{
                        padding: '7px 16px', borderRadius: '8px', border: 'none', flexShrink: 0,
                        background: isGoalMet
                          ? 'rgba(255,255,255,0.08)'
                          : endsToday ? '#ef4444' : '#7c3aed',
                        color: isGoalMet ? 'rgba(255,255,255,0.3)' : '#fff',
                        fontWeight: 700, fontSize: '12px',
                        cursor: isGoalMet ? 'not-allowed' : 'pointer',
                        animation: endsToday && !isGoalMet ? 'btnPulse 2s ease-in-out infinite' : 'none',
                      }}>
                      {isGoalMet ? 'Funded ✓' : endsToday ? '⚡ Last Day!' : 'Donate'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}