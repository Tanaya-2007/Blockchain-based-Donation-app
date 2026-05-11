import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const ROLES = [
  {
    key: 'donor',
    icon: '🙋',
    title: 'Donor',
    desc: 'I want to donate to campaigns and track my contributions',
    border: 'rgba(124,58,237,0.5)',
    bg: 'rgba(124,58,237,0.12)',
    color: '#c4b5fd',
  },
  {
    key: 'ngo',
    icon: '🏥',
    title: 'Organization',
    desc: 'NGO, hospital, school, disaster relief — I need to raise funds',
    border: 'rgba(34,211,238,0.5)',
    bg: 'rgba(34,211,238,0.1)',
    color: '#67e8f9',
  },
  {
    key: 'admin',
    icon: '🛡️',
    title: 'Admin',
    desc: 'Platform administrator — I approve NGO requests and manage campaigns',
    border: 'rgba(245,158,11,0.5)',
    bg: 'rgba(245,158,11,0.1)',
    color: '#fcd34d',
  },
];

export default function Login() {
  const { user, role, signInWithGoogle } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [selectedRole, setSelectedRole] = useState('donor');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (!user || !role) return;

    // Respect protected-route "from" redirect
    const from = loc.state?.from;
    if (from && from !== '/login') { nav(from, { replace: true }); return; }

    // Always route by ACTUAL Firestore role first — cannot be overridden by selection
    if (role === 'admin') { nav('/admin', { replace: true }); return; }
    if (role === 'ngo')   { nav('/ngo',   { replace: true }); return; }

    // Actual role is donor:
    // If they selected Organization → send to /ngo to fill registration form
    if (selectedRole === 'ngo') { nav('/ngo', { replace: true }); return; }

    // Otherwise → homepage, donors don't have a special dashboard
    nav('/', { replace: true });

  }, [user, role, selectedRole]); // ← selectedRole in deps fixes stale-closure bug

  const handleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      sessionStorage.setItem('tf_role_hint', selectedRole);
      await signInWithGoogle();
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const chosen = ROLES.find(r => r.key === selectedRole);

  return (
    <div style={{
      minHeight: 'calc(100vh - 68px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '999px',
            border: '1px solid rgba(124,58,237,0.35)',
            background: 'rgba(124,58,237,0.1)',
            color: '#a78bfa', fontSize: '12px', fontWeight: 600,
            marginBottom: '20px',
          }}>
            <span>💎</span> TransparentFund
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '36px', fontWeight: 800, color: '#fff',
            letterSpacing: '-1px', marginBottom: '10px',
          }}>Welcome back</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', lineHeight: 1.6 }}>
            Choose your role, then sign in with Google
          </p>
        </div>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setSelectedRole(r.key)} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '18px 20px', borderRadius: '16px', cursor: 'pointer',
              border: selectedRole === r.key
                ? `1px solid ${r.border}` : '1px solid rgba(255,255,255,0.08)',
              background: selectedRole === r.key ? r.bg : 'rgba(255,255,255,0.03)',
              transition: 'all 0.2s', textAlign: 'left', outline: 'none',
            }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                border: selectedRole === r.key
                  ? `2px solid ${r.color}` : '2px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                {selectedRole === r.key && (
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: r.color }} />
                )}
              </div>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                border: `1px solid ${selectedRole === r.key ? r.border : 'rgba(255,255,255,0.08)'}`,
                background: selectedRole === r.key ? r.bg : 'rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', flexShrink: 0, transition: 'all 0.2s',
              }}>{r.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '15px', fontWeight: 700,
                  color: selectedRole === r.key ? '#fff' : 'rgba(255,255,255,0.7)',
                  marginBottom: '4px',
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}>{r.title}</div>
                <div style={{
                  fontSize: '12px', lineHeight: 1.5,
                  color: selectedRole === r.key ? r.color : 'rgba(255,255,255,0.3)',
                }}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {selectedRole === 'admin' && (
          <div style={{
            padding: '14px 18px', borderRadius: '12px', marginBottom: '20px',
            border: '1px solid rgba(245,158,11,0.3)',
            background: 'rgba(245,158,11,0.08)',
            fontSize: '13px', color: '#fcd34d', lineHeight: 1.6,
          }}>
            ⚠️ Admin access is only granted if your email matches the pre-approved admin list.
            Otherwise you will be redirected to the homepage.
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
            border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)',
            fontSize: '13px', color: '#fca5a5',
          }}>{error}</div>
        )}

        <button onClick={handleSignIn} disabled={loading} style={{
          width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
          background: loading ? 'rgba(124,58,237,0.5)' : '#7c3aed',
          color: '#fff', fontWeight: 700, fontSize: '15px',
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          boxShadow: '0 0 28px rgba(124,58,237,0.35)', transition: 'all 0.2s',
        }}>
          {loading ? (
            <>
              <span style={{
                width: '18px', height: '18px',
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Signing in…
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google as {chosen.title}
            </>
          )}
        </button>

        <p style={{
          textAlign: 'center', marginTop: '20px',
          fontSize: '12px', color: 'rgba(255,255,255,0.25)',
        }}>
          Organization access requires submitting details and admin approval.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}