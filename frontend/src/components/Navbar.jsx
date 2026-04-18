import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

// Role → extra tab config
const ROLE_TAB = {
  donor: null, // no extra tab for donors
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
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const roleTab  = ROLE_TAB[role] || null;
  const allLinks = roleTab
    ? [...BASE_LINKS, roleTab]
    : BASE_LINKS;

  const close = () => setOpen(false);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: '68px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 32px',
      background: 'rgba(5,8,18,0.88)', backdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* Logo */}
      <button onClick={() => { close(); nav('/'); }}
        style={{ display:'flex', alignItems:'center', gap:'10px', background:'none', border:'none', cursor:'pointer', padding:0 }}>
        <div style={{
          width:'36px', height:'36px', borderRadius:'10px',
          background:'linear-gradient(135deg,#7c3aed,#0891b2)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px',
        }}>💎</div>
        <span style={{
          fontFamily:"'Playfair Display',Georgia,serif",
          fontWeight:800, fontSize:'18px', color:'#fff', letterSpacing:'-0.3px',
        }}>
          Transparent<span style={{ color:'#8b5cf6' }}>Fund</span>
        </span>
      </button>

      {/* Desktop links */}
      <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
        {allLinks.map(l => (
          <NavLink key={l.to} to={l.to}
            style={({ isActive }) => ({
              padding: '7px 14px', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
              transition: 'all 0.15s',
              // Role tab gets special accent colour
              color: l.color
                ? (isActive ? l.color : `${l.color}99`)
                : (isActive ? '#fff' : 'rgba(255,255,255,0.55)'),
              background: isActive
                ? (l.color ? `${l.color}18` : 'rgba(255,255,255,0.08)')
                : 'transparent',
              border: l.color && isActive ? `1px solid ${l.color}40` : '1px solid transparent',
            })}>
            {l.icon && <span style={{ marginRight:'5px' }}>{l.icon}</span>}
            {l.label}
          </NavLink>
        ))}
      </div>

      {/* Right CTAs */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
        <button onClick={() => onDonate(null)}
          style={{
            padding:'9px 20px', borderRadius:'10px', border:'none',
            background:'linear-gradient(135deg,#7c3aed,#0891b2)',
            color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer',
            boxShadow:'0 0 20px rgba(124,58,237,0.3)',
          }}>
          Donate Now
        </button>

        {!user ? (
          <NavLink to="/login"
            style={{
              padding:'9px 20px', borderRadius:'10px',
              border:'1px solid rgba(255,255,255,0.14)',
              background:'rgba(255,255,255,0.05)',
              color:'#fff', fontWeight:700, fontSize:'13px', textDecoration:'none',
            }}>
            Sign in
          </NavLink>
        ) : (
          <button onClick={() => signOut()}
            style={{
              padding:'9px 20px', borderRadius:'10px',
              border:'1px solid rgba(255,255,255,0.14)',
              background:'rgba(255,255,255,0.05)',
              color:'rgba(255,255,255,0.8)', fontWeight:700, fontSize:'13px', cursor:'pointer',
            }}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}