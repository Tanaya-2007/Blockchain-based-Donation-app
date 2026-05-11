import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const ROLE_TAB = {
  donor: null,
  ngo:   { label: 'Organization', to: '/ngo',   color: '#67e8f9', icon: '🏥' },
  admin: { label: 'Admin',        to: '/admin',  color: '#fcd34d', icon: '🛡️' },
};

const BASE_LINKS = [
  { label: 'Home',         to: '/'             },
  { label: 'Campaigns',    to: '/campaigns'    },
  { label: 'Transparency', to: '/transparency' },
  { label: 'Ledger',       to: '/ledger'       },
];

export default function Navbar({ onDonate }) {
  const { user, role, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useNavigate();

  const roleTab  = ROLE_TAB[role] || null;
  const allLinks = roleTab ? [...BASE_LINKS, roleTab] : BASE_LINKS;

  const close = () => setMenuOpen(false);

  // If user not logged in, redirect to login; otherwise open donate modal
  const handleDonate = () => {
    close();
    if (!user) { nav('/login'); return; }
    onDonate(null);
  };

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '68px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 24px',
        background: 'rgba(5,8,18,0.92)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>

        {/* ── Logo (always left) ── */}
        <button onClick={() => { close(); nav('/'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
          }}>💎</div>
          <span style={{
            fontFamily: "'Playfair Display',Georgia,serif",
            fontWeight: 800, fontSize: '18px', color: '#fff', letterSpacing: '-0.3px',
          }}>
            Transparent<span style={{ color: '#8b5cf6' }}>Fund</span>
          </span>
        </button>

        {/* ── Desktop links (hidden on mobile) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="nav-desktop">
          {allLinks.map(l => (
            <NavLink key={l.to} to={l.to}
              style={({ isActive }) => ({
                padding: '7px 14px', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600, textDecoration: 'none',
                transition: 'all 0.15s',
                color: l.color
                  ? (isActive ? l.color : `${l.color}99`)
                  : (isActive ? '#fff' : 'rgba(255,255,255,0.55)'),
                background: isActive
                  ? (l.color ? `${l.color}18` : 'rgba(255,255,255,0.08)')
                  : 'transparent',
                border: l.color && isActive ? `1px solid ${l.color}40` : '1px solid transparent',
              })}>
              {l.icon && <span style={{ marginRight: '5px' }}>{l.icon}</span>}
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* ── Desktop right CTAs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="nav-desktop">
          <button onClick={handleDonate}
            style={{
              padding: '9px 20px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
              color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
            Donate Now
          </button>

          {!user ? (
            <NavLink to="/login" style={{
              padding: '9px 20px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
            }}>Sign in</NavLink>
          ) : (
            <>
              <NavLink to="/account" style={({ isActive }) => ({
                padding: '7px 14px', borderRadius: '10px', textDecoration: 'none',
                border: isActive ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.14)',
                background: isActive ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)',
                color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.8)',
                fontWeight: 700, fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '6px',
              })}>
                {user?.photoURL
                  ? <img src={user.photoURL} referrerPolicy="no-referrer" alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '14px' }}>👤</span>}
                My Account
              </NavLink>
              <button onClick={() => signOut()} style={{
                padding: '9px 20px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              }}>Sign out</button>
            </>
          )}
        </div>

        {/* ── Hamburger button (mobile only, always right) ── */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="nav-hamburger"
          aria-label="Toggle menu"
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px', padding: '8px 10px',
            cursor: 'pointer', display: 'flex', flexDirection: 'column',
            gap: '5px', alignItems: 'center', justifyContent: 'center',
          }}>
          <span style={{ display: 'block', width: '20px', height: '2px', background: menuOpen ? 'rgba(255,255,255,0.4)' : '#fff', borderRadius: '2px', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }} />
          <span style={{ display: 'block', width: '20px', height: '2px', background: '#fff', borderRadius: '2px', opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
          <span style={{ display: 'block', width: '20px', height: '2px', background: menuOpen ? 'rgba(255,255,255,0.4)' : '#fff', borderRadius: '2px', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }} />
        </button>
      </nav>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div className="nav-mobile-drawer" style={{
          position: 'fixed', top: '68px', left: 0, right: 0, zIndex: 99,
          background: 'rgba(5,8,18,0.97)', backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          {allLinks.map(l => (
            <NavLink key={l.to} to={l.to} onClick={close}
              style={({ isActive }) => ({
                padding: '12px 16px', borderRadius: '10px',
                fontSize: '14px', fontWeight: 600, textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
                color: l.color
                  ? (isActive ? l.color : `${l.color}bb`)
                  : (isActive ? '#fff' : 'rgba(255,255,255,0.6)'),
                background: isActive
                  ? (l.color ? `${l.color}14` : 'rgba(255,255,255,0.07)')
                  : 'transparent',
              })}>
              {l.icon && <span>{l.icon}</span>}
              {l.label}
            </NavLink>
          ))}

          {/* divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '10px 0' }} />

          <button onClick={handleDonate}
            style={{
              padding: '13px 20px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
              color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              textAlign: 'left',
            }}>
            💜 Donate Now
          </button>

          {!user ? (
            <NavLink to="/login" onClick={close} style={{
              padding: '13px 20px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
              display: 'block', marginTop: '4px',
            }}>Sign in</NavLink>
          ) : (
            <>
              <NavLink to="/account" onClick={close} style={({ isActive }) => ({
                padding: '13px 20px', borderRadius: '10px', textDecoration: 'none',
                border: isActive ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.14)',
                background: isActive ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)',
                color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.8)',
                fontWeight: 700, fontSize: '14px', marginTop: '4px',
                display: 'flex', alignItems: 'center', gap: '8px',
              })}>
                {user?.photoURL
                  ? <img src={user.photoURL} referrerPolicy="no-referrer" alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />
                  : <span>👤</span>}
                My Account
              </NavLink>
              <button onClick={() => { close(); signOut(); }} style={{
                padding: '13px 20px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', textAlign: 'left', marginTop: '4px',
              }}>Sign out</button>
            </>
          )}
        </div>
      )}

      {/* ── CSS for responsive breakpoints ── */}
      <style>{`
        .nav-desktop { display: flex !important; }
        .nav-hamburger { display: none !important; }
        .nav-mobile-drawer { display: flex !important; }

        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}