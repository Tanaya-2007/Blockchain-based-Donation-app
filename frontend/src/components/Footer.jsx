import { Link } from 'react-router-dom';

const LINKS = {
  Platform: [
    { label: 'Home',             to: '/'             },
    { label: 'Campaigns',        to: '/campaigns'    },
    { label: 'Transparency',     to: '/transparency' },
    { label: 'Immutable Ledger', to: '/ledger'       },
  ],
  Organisation: [
    { label: 'Register NGO',    to: '/ngo'            },
    { label: 'Create Campaign', to: '/create-campaign'},
    { label: 'Upload Proof',    to: '/proof'          },
    { label: 'NGO Dashboard',   to: '/ngo'            },
  ],
  Account: [
    { label: 'Sign In',          to: '/login'   },
    { label: 'My Account',       to: '/account' },
    { label: 'Donation History', to: '/account' },
  ],
};

const TECH = [
  { label: 'Polygon Blockchain', icon: '⛓️',  color: '#8b5cf6' },
  { label: 'Gemini 2.0 Flash',   icon: '✨',  color: '#22d3ee' },
  { label: 'Groq Llama-4',       icon: '⚡',  color: '#a78bfa' },
  { label: 'Razorpay',           icon: '💳',  color: '#34d399' },
  { label: 'Firebase',           icon: '🔥',  color: '#fbbf24' },
  { label: 'Tesseract OCR',      icon: '🔍',  color: '#f472b6' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{
      position: 'relative',
      overflow: 'hidden',
      marginTop: 0,
      background: '#050812',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* ── Top gradient line ── */}
      <div style={{
        height: '2px',
        background: 'linear-gradient(90deg, transparent 0%, #7c3aed 30%, #0891b2 70%, transparent 100%)',
      }}/>

      {/* ── Ambient glows ── */}
      <div style={{ position:'absolute', top:'-80px', left:'15%', width:'320px', height:'220px', background:'radial-gradient(ellipse, rgba(124,58,237,0.1) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', top:'-60px', right:'15%', width:'280px', height:'180px', background:'radial-gradient(ellipse, rgba(8,145,178,0.08) 0%, transparent 70%)', pointerEvents:'none' }}/>

      {/* ── Main content ── */}
      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'52px 24px 0' }}>

        {/* ── Top row: brand + tagline + CTA ── */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'flex-start', flexWrap:'wrap', gap:'32px',
          paddingBottom:'40px',
          borderBottom:'1px solid rgba(255,255,255,0.05)',
          marginBottom:'40px',
        }}>
          {/* Brand */}
          <div style={{ maxWidth:'380px' }}>
            <div style={{
              fontFamily:"'Playfair Display',Georgia,serif",
              fontSize:'26px', fontWeight:800, color:'#fff',
              letterSpacing:'-0.5px', marginBottom:'12px',
            }}>
              Transparent<span style={{ color:'#8b5cf6' }}>Fund</span>
            </div>
            <p style={{
              fontSize:'14px', color:'rgba(255,255,255,0.4)',
              lineHeight:1.8, marginBottom:'20px',
            }}>
              India's first AI-verified, blockchain-secured donation platform.
              Every rupee is cryptographically locked until milestones are
              independently verified — zero manual interference.
            </p>
            {/* Live status pill */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:'8px',
              padding:'7px 14px', borderRadius:'999px',
              background:'rgba(52,211,153,0.08)',
              border:'1px solid rgba(52,211,153,0.2)',
            }}>
              <span style={{
                width:'7px', height:'7px', borderRadius:'50%',
                background:'#34d399', display:'inline-block',
                boxShadow:'0 0 8px #34d399',
                animation:'ftPulse 2s infinite',
              }}/>
              <span style={{ fontSize:'12px', color:'#6ee7b7', fontWeight:600 }}>
                Platform live · All systems operational
              </span>
            </div>
          </div>

          {/* CTA block */}
          <div style={{
            padding:'28px 32px', borderRadius:'20px',
            background:'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(8,145,178,0.08))',
            border:'1px solid rgba(124,58,237,0.2)',
            minWidth:'260px', textAlign:'center',
          }}>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.4)', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600 }}>
              Ready to make impact?
            </div>
            <div style={{
              fontFamily:"'Playfair Display',Georgia,serif",
              fontSize:'20px', fontWeight:800, color:'#fff', marginBottom:'18px',
            }}>
              Start donating today
            </div>
            <Link to="/campaigns" style={{
              display:'block', padding:'11px 24px', borderRadius:'12px',
              background:'linear-gradient(135deg,#7c3aed,#0891b2)',
              color:'#fff', fontWeight:700, fontSize:'14px',
              textDecoration:'none', marginBottom:'10px',
              boxShadow:'0 0 20px rgba(124,58,237,0.3)',
              transition:'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity='0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity='1'}>
              Browse Campaigns →
            </Link>
            <Link to="/ngo" style={{
              display:'block', padding:'10px 24px', borderRadius:'12px',
              background:'rgba(255,255,255,0.05)',
              border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.6)', fontWeight:600, fontSize:'13px',
              textDecoration:'none', transition:'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.09)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}>
              Register your NGO
            </Link>
          </div>
        </div>

        {/* ── Nav links ── */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',
          gap:'36px',
          paddingBottom:'40px',
          borderBottom:'1px solid rgba(255,255,255,0.05)',
          marginBottom:'36px',
        }}>
          {Object.entries(LINKS).map(([section, items]) => (
            <div key={section}>
              <div style={{
                fontSize:'11px', fontWeight:700,
                letterSpacing:'2px', textTransform:'uppercase',
                color:'rgba(255,255,255,0.22)', marginBottom:'18px',
                display:'flex', alignItems:'center', gap:'8px',
              }}>
                <span style={{ width:'16px', height:'1px', background:'rgba(124,58,237,0.6)', display:'inline-block' }}/>
                {section}
              </div>
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'11px' }}>
                {items.map(l => (
                  <li key={l.label}>
                    <Link to={l.to} style={{
                      fontSize:'14px', color:'rgba(255,255,255,0.45)',
                      textDecoration:'none', transition:'all 0.2s',
                      display:'inline-flex', alignItems:'center', gap:'6px',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.paddingLeft='4px'; }}
                      onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.45)'; e.currentTarget.style.paddingLeft='0'; }}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Tech stack mini-column */}
          <div>
            <div style={{
              fontSize:'11px', fontWeight:700,
              letterSpacing:'2px', textTransform:'uppercase',
              color:'rgba(255,255,255,0.22)', marginBottom:'18px',
              display:'flex', alignItems:'center', gap:'8px',
            }}>
              <span style={{ width:'16px', height:'1px', background:'rgba(8,145,178,0.6)', display:'inline-block' }}/>
              Tech Stack
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'9px' }}>
              {TECH.map(t => (
                <div key={t.label} style={{
                  display:'inline-flex', alignItems:'center', gap:'8px',
                  fontSize:'12px', color:'rgba(255,255,255,0.4)',
                }}>
                  <span style={{ fontSize:'13px' }}>{t.icon}</span>
                  <span style={{ color: t.color, fontWeight:600 }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Security badges row ── */}
        <div style={{
          display:'flex', flexWrap:'wrap', gap:'10px',
          justifyContent:'center', marginBottom:'32px',
        }}>
          {[
            { icon:'🔒', text:'256-bit SSL Encrypted' },
            { icon:'⛓️', text:'Blockchain Immutable' },
            { icon:'🤖', text:'AI Fraud Detection' },
            { icon:'💳', text:'RBI Compliant Payments' },
            { icon:'🛡️', text:'Zero Manual Interference' },
          ].map(b => (
            <div key={b.text} style={{
              display:'inline-flex', alignItems:'center', gap:'7px',
              padding:'6px 14px', borderRadius:'999px',
              background:'rgba(255,255,255,0.03)',
              border:'1px solid rgba(255,255,255,0.08)',
              fontSize:'12px', color:'rgba(255,255,255,0.35)',
              fontWeight:500,
            }}>
              <span>{b.icon}</span> {b.text}
            </div>
          ))}
        </div>

        {/* ── Bottom bar ── */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', flexWrap:'wrap', gap:'12px',
          padding:'18px 0 28px',
          borderTop:'1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.2)' }}>
            © {year} TransparentFund · Built for Google Solution Challenge · Made with ❤️ in India
          </div>
          <div style={{ display:'flex', gap:'20px' }}>
            {['Privacy Policy','Terms of Use','Contact'].map(t => (
              <span key={t} style={{
                fontSize:'12px', color:'rgba(255,255,255,0.25)',
                cursor:'pointer', transition:'color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,0.6)'}
                onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ftPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @media (max-width:768px) {
          footer .ft-top { flex-direction: column !important; }
        }
      `}</style>
    </footer>
  );
}