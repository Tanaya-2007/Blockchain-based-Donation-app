import { ledgerData } from '../data';

const TYPE_STYLE = {
  donation: { background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' },
  release:  { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' },
  proof:    { background: 'rgba(245,158,11,0.15)', color: '#fcd34d' },
};

export default function Ledger() {
  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '36px' }}>
        <div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '30px', fontWeight: 800, color: '#fff',
            letterSpacing: '-0.5px', marginBottom: '6px',
          }}>Blockchain Ledger</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
            Every transaction permanently recorded on Polygon — publicly verifiable
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 18px', borderRadius: '999px',
          border: '1px solid rgba(124,58,237,0.35)',
          background: 'rgba(124,58,237,0.1)',
          color: '#a78bfa', fontSize: '12px', fontWeight: 600,
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#34d399',
            animation: 'pulse 2s infinite',
          }} />
          Polygon Mainnet · Live
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px', marginBottom: '28px',
      }}>
        {[
          { label: 'Total Blocks', val: '2,847', color: '#a78bfa' },
          { label: 'Transactions', val: '194', color: '#22d3ee' },
          { label: 'Avg Gas Fee', val: '₹0.001', color: '#34d399' },
        ].map(s => (
          <div key={s.label} style={{
            borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)',
            background: '#0d1021', padding: '24px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '32px', fontWeight: 800, color: s.color, marginBottom: '6px',
            }}>{s.val}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live feed */}
      <div style={{
        borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', overflow: 'hidden',
      }}>
        <div style={{
          padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '18px', fontWeight: 700, color: '#fff',
          }}>Live Transaction Feed</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '12px', color: 'rgba(255,255,255,0.4)',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%', background: '#34d399',
            }} />
            Auto-updating
          </div>
        </div>

        <div>
          {ledgerData.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '16px 28px',
              borderBottom: i < ledgerData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{
                fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa',
                minWidth: '80px',
              }}>{b.block}</div>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                borderRadius: '999px', ...TYPE_STYLE[b.type],
              }}>
                {b.type.charAt(0).toUpperCase() + b.type.slice(1)}
              </span>
              <div style={{
                fontFamily: 'monospace', fontSize: '12px',
                color: 'rgba(255,255,255,0.4)', flex: 1,
              }}>{b.details}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{b.time}</div>
              <div style={{
                fontSize: '14px', fontWeight: 700, color: '#22d3ee',
                minWidth: '80px', textAlign: 'right',
              }}>{b.amt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}