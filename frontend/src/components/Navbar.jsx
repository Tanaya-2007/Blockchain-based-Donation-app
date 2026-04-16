const LINKS = [
  { label: 'Home', key: 'home' },
  { label: 'Campaigns', key: 'campaigns' },
  { label: 'Upload Proof', key: 'proof' },
  { label: 'Dashboard', key: 'dashboard' },
  { label: 'Blockchain Ledger', key: 'ledger' },
];

export default function Navbar({ page, setPage, onDonate }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: '68px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 48px',
      background: 'rgba(8,10,22,0.92)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Logo */}
      <button onClick={() => setPage('home')} style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'none', border: 'none', cursor: 'pointer',
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'linear-gradient(135deg,#6d28d9,#0891b2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>💎</div>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 800, fontSize: '18px', color: '#fff', letterSpacing: '-0.3px',
        }}>
          Transparent<span style={{ color: '#7c3aed' }}>Fund</span>
        </span>
      </button>

      {/* Links + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {LINKS.map(l => (
          <button key={l.key} onClick={() => setPage(l.key)} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none',
            background: page === l.key ? 'rgba(255,255,255,0.09)' : 'transparent',
            color: page === l.key ? '#fff' : 'rgba(255,255,255,0.5)',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { if (page !== l.key) { e.target.style.color = '#fff'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}}
            onMouseLeave={e => { if (page !== l.key) { e.target.style.color = 'rgba(255,255,255,0.5)'; e.target.style.background = 'transparent'; }}}
          >{l.label}</button>
        ))}
        <button onClick={() => onDonate(null)} style={{
          marginLeft: '12px', padding: '9px 22px', borderRadius: '10px',
          border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
          color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
          boxShadow: '0 0 24px rgba(124,58,237,0.4)',
        }}>Donate Now</button>
      </div>
    </nav>
  );
}