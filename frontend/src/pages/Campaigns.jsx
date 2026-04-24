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

export default function Campaigns({ onDonate }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [hovered,   setHovered]   = useState(null);
  const [error,     setError]     = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const snap = await getDocs(query(collection(db, 'campaigns'), where('status', '==', 'active')));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setCampaigns(list);
      } catch (e) { console.error(e); setError(e.message); }
      setLoading(false);
    })();
  }, []);

  const shown = filter === 'all' ? campaigns : campaigns.filter(c => c.category === filter);

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>

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

            return (
              <div key={c.id}
                onClick={() => onDonate({ ...c })}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  borderRadius: '20px',
                  border: isHov ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  overflow: 'hidden', cursor: 'pointer', background: '#0d1021',
                  transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isHov ? '0 16px 48px rgba(0,0,0,0.5)' : 'none',
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
                    <span style={{ position: 'absolute', bottom: '12px', left: '12px', fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: daysLeft <= 3 ? '#fca5a5' : 'rgba(255,255,255,0.7)' }}>
                      {daysLeft === 0 ? 'Ends today' : `${daysLeft}d left`}
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
                    <span><strong style={{ color: '#fff' }}>₹{raised.toLocaleString('en-IN')}</strong> raised</span>
                    <strong style={{ color: pct >= 100 ? '#34d399' : '#fff' }}>{pct}%</strong>
                  </div>
                  <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', marginBottom: '8px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#7c3aed,#0891b2)' }} />
                  </div>

                  {/* Blockchain Funds Info */}
                  <div style={{ display: 'flex', gap:'12px', fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '14px 0', padding: '10px 14px', background: 'rgba(124,58,237,0.05)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight: 700, color: '#fcd34d'}}>₹{locked.toLocaleString('en-IN')}</div>
                      <div style={{fontSize: '9px', letterSpacing:'0.5px'}}>LOCKED (CHAIN)</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight: 700, color: '#6ee7b7'}}>₹{released.toLocaleString('en-IN')}</div>
                      <div style={{fontSize: '9px', letterSpacing:'0.5px'}}>RELEASED (CHAIN)</div>
                    </div>
                  </div>

                  {/* Goal + remaining — fixed layout, no overflow */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '3px' }}>
                      Goal: ₹{target.toLocaleString('en-IN')} · {c.donorCount || 0} donor{c.donorCount !== 1 ? 's' : ''}
                    </div>
                    {isGoalMet ? (
                      <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>🎉 Goal reached!</div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#22d3ee', fontWeight: 600 }}>
                        ₹{remaining.toLocaleString('en-IN')} still needed
                      </div>
                    )}
                  </div>

                  {/* Bottom row — milestone left, donate button right */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22d3ee', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        M{c.currentMilestone || 1} of {c.milestones?.length || '?'}
                      </span>
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); onDonate({ ...c }); }}
                      disabled={isGoalMet}
                      style={{
                        padding: '7px 16px', borderRadius: '8px', border: 'none', flexShrink: 0,
                        background: isGoalMet ? 'rgba(255,255,255,0.08)' : '#7c3aed',
                        color: isGoalMet ? 'rgba(255,255,255,0.3)' : '#fff',
                        fontWeight: 700, fontSize: '12px',
                        cursor: isGoalMet ? 'not-allowed' : 'pointer',
                      }}>
                      {isGoalMet ? 'Funded ✓' : 'Donate'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}