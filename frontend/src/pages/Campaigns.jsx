import { useState } from 'react';
import { campaigns } from '../data';

const FILTERS = ['All', 'Medical', 'NGO', 'Education', 'Disaster'];
const KEYS = ['all', 'medical', 'ngo', 'education', 'disaster'];

const CAT_BG = {
  medical: 'linear-gradient(135deg,#1e0840 0%,#2d1052 100%)',
  ngo: 'linear-gradient(135deg,#01132a 0%,#052040 100%)',
  education: 'linear-gradient(135deg,#1a1a05 0%,#2d2d0f 100%)',
  disaster: 'linear-gradient(135deg,#200505 0%,#3a1010 100%)',
};

export default function Campaigns({ onDonate }) {
  const [filter, setFilter] = useState('all');
  const [hovered, setHovered] = useState(null);
  const shown = filter === 'all' ? campaigns : campaigns.filter(c => c.cat === filter);

  return (
    <div style={{ padding: '88px 48px 60px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px' }}>
        <div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '30px', fontWeight: 800, letterSpacing: '-0.5px',
            color: '#fff', marginBottom: '6px',
          }}>Active Campaigns</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
            All campaigns verified · Funds milestone-locked on Polygon
          </p>
        </div>
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

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '20px',
      }}>
        {shown.map(c => {
          const pct = Math.round((c.raised / c.goal) * 100);
          const isHov = hovered === c.id;
          return (
            <div key={c.id}
              onClick={() => onDonate(c)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                borderRadius: '20px',
                border: isHov ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                overflow: 'hidden', cursor: 'pointer',
                background: '#0d1021',
                transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: isHov ? '0 16px 48px rgba(0,0,0,0.5)' : 'none',
                transition: 'all 0.25s ease',
              }}>
              {/* Image area */}
              <div style={{
                height: '160px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '56px', position: 'relative',
                background: CAT_BG[c.cat] || CAT_BG.medical,
              }}>
                {c.emoji}
                {c.verified && (
                  <span style={{
                    position: 'absolute', top: '12px', right: '12px',
                    fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                    borderRadius: '999px', border: '1px solid rgba(16,185,129,0.5)',
                    background: 'rgba(16,185,129,0.15)', color: '#6ee7b7',
                  }}>✓ Verified</span>
                )}
              </div>

              <div style={{ padding: '20px 22px 22px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 700, letterSpacing: '2px',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px',
                }}>{c.cat}</div>
                <h3 style={{
                  fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px',
                  color: '#fff', marginBottom: '8px', lineHeight: 1.35,
                }}>{c.title}</h3>
                <p style={{
                  color: 'rgba(255,255,255,0.38)', fontSize: '12px',
                  lineHeight: 1.65, marginBottom: '18px',
                }}>{c.desc}</p>

                {/* Progress */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px',
                }}>
                  <span><strong style={{ color: '#fff' }}>₹{(c.raised / 100000).toFixed(1)}L</strong> raised</span>
                  <strong style={{ color: '#fff' }}>{pct}%</strong>
                </div>
                <div style={{
                  height: '4px', borderRadius: '4px',
                  background: 'rgba(255,255,255,0.08)', marginBottom: '6px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: '4px',
                    background: 'linear-gradient(90deg,#7c3aed,#0891b2)',
                  }} />
                </div>
                <div style={{
                  fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '18px',
                }}>Goal: ₹{(c.goal / 100000).toFixed(1)}L</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '11px', color: 'rgba(255,255,255,0.35)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: '#22d3ee', display: 'inline-block',
                    }} />
                    {c.milestone}
                  </span>
                  <button onClick={e => { e.stopPropagation(); onDonate(c); }} style={{
                    padding: '7px 18px', borderRadius: '8px', border: 'none',
                    background: '#7c3aed', color: '#fff', fontWeight: 700,
                    fontSize: '12px', cursor: 'pointer',
                  }}>Donate</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}