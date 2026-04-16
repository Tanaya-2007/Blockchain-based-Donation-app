import { txData, barData } from '../data';

const TYPE_STYLE = {
  release:  { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' },
  donation: { background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' },
  proof:    { background: 'rgba(245,158,11,0.15)', color: '#fcd34d' },
};

const STATS = [
  { label: 'Total Collected', val: '₹8,42,500', sub: 'Across 12 campaigns', color: '#a78bfa' },
  { label: 'Funds Released', val: '₹3,15,000', sub: 'After proof verification', color: '#34d399' },
  { label: 'In Smart Contract', val: '₹5,27,500', sub: 'Locked — milestone pending', color: '#fbbf24' },
  { label: 'AI Verified Proofs', val: '47', sub: '3 rejected · 2 pending vote', color: '#22d3ee' },
];

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '30px', fontWeight: 800, color: '#fff',
        letterSpacing: '-0.5px', marginBottom: '6px',
      }}>Transparency Dashboard</h2>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '36px' }}>
        Real-time fund tracking — publicly verifiable
      </p>

      {/* Stat cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px', marginBottom: '28px',
      }}>
        {STATS.map(s => (
          <div key={s.label} style={{
            borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)',
            background: '#0d1021', padding: '22px',
          }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px', fontWeight: 500 }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '26px', fontWeight: 800, color: s.color, marginBottom: '4px',
            }}>{s.val}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{
        borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '28px', marginBottom: '20px',
      }}>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '28px',
        }}>Fund Flow — Last 7 Campaigns</div>

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: '12px',
          height: '140px', marginBottom: '16px',
        }}>
          {barData.map((d, i) => (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '2px',
            }}>
              <div style={{
                width: '100%', display: 'flex', alignItems: 'flex-end',
                gap: '2px', height: '120px',
              }}>
                <div style={{
                  flex: 1, borderRadius: '4px 4px 0 0',
                  height: `${d.c}%`,
                  background: 'linear-gradient(to top,#7c3aed,#8b5cf6)',
                }} />
                <div style={{
                  flex: 1, borderRadius: '4px 4px 0 0',
                  height: `${d.r}%`,
                  background: 'linear-gradient(to top,#0891b2,#22d3ee)',
                }} />
                <div style={{
                  flex: 1, borderRadius: '4px 4px 0 0',
                  height: `${d.k}%`,
                  background: 'rgba(255,255,255,0.08)',
                }} />
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '6px' }}>{d.l}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '20px' }}>
          {[
            { color: '#7c3aed', label: 'Collected' },
            { color: '#0891b2', label: 'Released' },
            { color: 'rgba(255,255,255,0.08)', label: 'Remaining' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Transaction table */}
      <div style={{
        borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', overflow: 'hidden',
      }}>
        <div style={{
          padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '18px', fontWeight: 700, color: '#fff',
        }}>Recent Transactions</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Campaign', 'Type', 'Amount', 'Milestone', 'Status', 'Tx Hash'].map(h => (
                  <th key={h} style={{
                    padding: '12px 20px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txData.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: 500, color: '#fff' }}>{t.camp}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                      borderRadius: '999px', ...TYPE_STYLE[t.type],
                    }}>
                      {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: 700, color: '#22d3ee' }}>{t.amt}</td>
                  <td style={{ padding: '16px 20px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t.ms}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                      borderRadius: '999px',
                      ...(t.status === 'v'
                        ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
                        : { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }
                      ),
                    }}>
                      {t.status === 'v' ? '✓ Verified' : '⏳ Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa' }}>{t.hash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}