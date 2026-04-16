const STEPS = [
  { icon: '🏥', title: 'Campaign Created', desc: 'Aadhaar, hospital & GST verified before going live' },
  { icon: '💳', title: 'Donor Pays UPI', desc: 'Funds locked in smart contract — nobody can touch it' },
  { icon: '📄', title: 'Proof Uploaded', desc: 'Bills, receipts, photos per milestone' },
  { icon: '🤖', title: 'AI Verifies', desc: 'Detects fake docs — confidence score decides' },
  { icon: '🏦', title: 'Funds Released', desc: 'INR to bank. Recorded on blockchain forever' },
];

const STATS = [
  { num: '₹2,900 Cr+', desc: 'Raised on Indian platforms with zero post-donation accountability' },
  { num: '10–15%', desc: 'Fee platforms cut before patient sees a single rupee' },
  { num: '46 Million', desc: 'Indian families in medical financial hardship every year' },
];

import { useNavigate } from 'react-router-dom';

export default function Home() {
  const nav = useNavigate();
  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ color: '#fff' }}>

      {/* ── HERO ── */}
      <section style={{
        maxWidth: '900px', margin: '0 auto',
        padding: '80px 0 64px', textAlign: 'center',
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '7px 18px', borderRadius: '999px',
          border: '1px solid rgba(124,58,237,0.4)',
          background: 'rgba(124,58,237,0.1)',
          color: '#a78bfa', fontSize: '13px', fontWeight: 500,
          marginBottom: '40px',
        }}>
          <span style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: '#7c3aed', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '10px',
          }}>💎</span>
          India's first AI-verified donation platform
        </div>

        {/* Hero headline */}
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(52px,8vw,92px)', fontWeight: 800,
          lineHeight: 1.05, letterSpacing: '-2px', margin: '0 0 28px',
        }}>
          <span style={{ color: '#ffffff' }}>You donate. We hold.</span>
          <br />
          <span style={{
            background: 'linear-gradient(90deg,#7c3aed 0%,#6366f1 40%,#22d3ee 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>They prove. Then</span>
          <br />
          <span style={{
            background: 'linear-gradient(90deg,#22d3ee 0%,#67e8f9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>receive.</span>
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.45)', fontSize: '18px',
          lineHeight: 1.65, maxWidth: '520px', margin: '0 auto 44px',
        }}>
          Funds locked in smart contracts on Polygon blockchain. Released only
          after 4-layer AI-verified proof. Every rupee tracked — forever.
        </p>

        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => nav('/campaigns')} style={{
            padding: '14px 32px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
            color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            boxShadow: '0 0 32px rgba(124,58,237,0.45)',
          }}>Browse Campaigns</button>
          <button onClick={() => nav('/transparency')} style={{
            padding: '14px 32px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
          }}>View Transparency</button>
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{
        margin: '0 0 80px',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.07)',
        background: '#0d1021',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        overflow: 'hidden',
      }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            padding: '40px 36px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
          }}>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '34px', fontWeight: 800, marginBottom: '8px',
              color: '#eef2ff',
              textShadow: '0 0 18px rgba(124,58,237,0.28)',
              letterSpacing: '-0.5px',
            }}>{s.num}</div>
            <div style={{
              color: 'rgba(255,255,255,0.4)', fontSize: '13px',
              lineHeight: 1.55, maxWidth: '180px', margin: '0 auto',
            }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '0 0 100px' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '2px',
          textTransform: 'uppercase', color: '#7c3aed', marginBottom: '12px',
        }}>How it works</div>
        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '32px', fontWeight: 800, letterSpacing: '-0.5px',
          marginBottom: '8px',
        }}>Five steps. Zero trust required.</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '40px' }}>
          From donation to verified fund release — every step on-chain.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1px',
          borderRadius: '20px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.06)',
        }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              background: '#0d1021', padding: '28px 22px',
              position: 'relative',
            }}>
              {i < STEPS.length - 1 && (
                <span style={{
                  position: 'absolute', right: '-10px', top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.25)', fontSize: '14px', zIndex: 1,
                }}>→</span>
              )}
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                border: '1px solid rgba(124,58,237,0.35)',
                background: 'rgba(124,58,237,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', marginBottom: '18px',
              }}>{s.icon}</div>
              <div style={{
                fontSize: '13px', fontWeight: 700, marginBottom: '8px',
                letterSpacing: '-0.2px',
              }}>{s.title}</div>
              <div style={{
                fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6,
              }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}