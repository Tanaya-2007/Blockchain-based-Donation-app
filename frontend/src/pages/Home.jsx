import { useNavigate } from 'react-router-dom';

const STEPS = [
  { icon: '🏥', title: '100% Verified Campaigns', desc: 'Aadhaar, hospital & GST securely verified before going live.' },
  { icon: '🔒', title: 'Funds Escrow Locked', desc: 'Donations locked safely in smart contracts. Zero manual interference.' },
  { icon: '📄', title: 'Milestone Proof Upload', desc: 'NGOs submit hospital bills & receipts for each phase of the project.' },
  { icon: '⚡', title: 'Gemini AI Verification', desc: 'Google Gemini 2.5 Flash analyzes documents for fraud and authenticity.' },
  { icon: '💸', title: 'Smart Release & Refund', desc: 'Passed? Funds released on Polygon. Failed? Donors get proportional refunds.' },
];

const STATS = [
  { num: '₹2,900 Cr+', desc: 'Raised annually in India with near-zero post-donation accountability.' },
  { num: '10–15%', desc: 'Platform fee cuts taken before the patient sees a single rupee.' },
  { num: '100%', desc: 'Transparency achieved through Gemini AI and immutable blockchain ledgers.' },
];

export default function Home() {
  const nav = useNavigate();
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-10 sm:py-16" style={{ color: '#fff', overflowX: 'hidden' }}>

      {/* ── HERO ── */}
      <section style={{
        maxWidth: '1000px', margin: '0 auto',
        padding: '60px 0 80px', textAlign: 'center',
        position: 'relative'
      }}>
        {/* Glow behind hero */}
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '400px', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', zIndex: -1, pointerEvents: 'none' }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          padding: '8px 20px', borderRadius: '999px',
          border: '1px solid rgba(124,58,237,0.5)',
          background: 'rgba(124,58,237,0.15)',
          color: '#c4b5fd', fontSize: '14px', fontWeight: 600,
          marginBottom: '40px', letterSpacing: '0.5px',
          boxShadow: '0 0 20px rgba(124,58,237,0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <span style={{ fontSize: '14px' }}>💎</span>
          India's first AI-verified donation platform
        </div>

        {/* Hero headline (Exact text preserved as requested) */}
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(48px, 8vw, 96px)', fontWeight: 800,
          lineHeight: 1.1, letterSpacing: '-1.5px', margin: '0 0 32px',
          textShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          <span style={{ color: '#ffffff' }}>You donate. We hold.</span>
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 40%, #06b6d4 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>They prove. Then</span>
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #34d399 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>receive.</span>
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(16px, 2vw, 20px)',
          lineHeight: 1.6, maxWidth: '650px', margin: '0 auto 48px',
          fontWeight: 400
        }}>
          Funds are escrow-locked in smart contracts on the Polygon blockchain. 
          Released only after Google Gemini AI and Admin validation. 
          <strong style={{ color: '#fca5a5' }}> If a milestone fails, your money is securely refunded.</strong>
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => nav('/campaigns')} style={{
            padding: '16px 36px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(139,92,246,0.4)', transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(139,92,246,0.4)' }}>
            Start Making an Impact
          </button>
          <button onClick={() => nav('/transparency')} style={{
            padding: '16px 36px', borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
            color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            transition: 'background 0.2s, transform 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}>
            View Live Transparency
          </button>
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{
        margin: '0 0 100px',
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'linear-gradient(145deg, #11142b, #0a0c1a)',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            padding: '48px 36px', textAlign: 'center',
            borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)' }} />
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '40px', fontWeight: 800, marginBottom: '12px',
              background: 'linear-gradient(135deg, #fff, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}>{s.num}</div>
            <div style={{
              color: 'rgba(255,255,255,0.5)', fontSize: '14px',
              lineHeight: 1.6, maxWidth: '200px', margin: '0 auto', fontWeight: 500
            }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '0 0 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <div style={{
            fontSize: '13px', fontWeight: 800, letterSpacing: '3px',
            textTransform: 'uppercase', color: '#a855f7', marginBottom: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <span style={{ width: '30px', height: '1px', background: 'rgba(168,85,247,0.5)' }} />
            How the Protocol Works
            <span style={{ width: '30px', height: '1px', background: 'rgba(168,85,247,0.5)' }} />
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.5px',
            marginBottom: '16px', color: '#fff'
          }}>Five steps. Zero trust required.</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px', maxWidth: '500px', margin: '0 auto' }}>
            We've eliminated the black box of charity. Every single rupee is tracked cryptographically until proven effectively utilized.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              background: 'linear-gradient(145deg, #11142b, #080a14)', padding: '36px 28px',
              borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)',
              position: 'relative', transition: 'transform 0.3s, box-shadow 0.3s',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(124,58,237,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)' }}>
              
              <div style={{
                position: 'absolute', top: '-15px', left: '28px',
                width: '30px', height: '30px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 800, color: '#fff',
                boxShadow: '0 4px 10px rgba(124,58,237,0.4)', border: '2px solid #080a14'
              }}>{i + 1}</div>

              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                border: '1px solid rgba(124,58,237,0.3)',
                background: 'rgba(124,58,237,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '28px', marginBottom: '24px',
              }}>{s.icon}</div>
              <div style={{
                fontSize: '16px', fontWeight: 700, marginBottom: '12px',
                letterSpacing: '-0.3px', color: '#fff'
              }}>{s.title}</div>
              <div style={{
                fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7,
              }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}