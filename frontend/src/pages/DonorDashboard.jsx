import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const ROLE_LABELS = {
  donor:       { label: 'Donor',        color: '#a78bfa', icon: '🙋' },
  ngo:         { label: 'Organization', color: '#67e8f9', icon: '🏥' },
  pending_ngo: { label: 'Pending Approval', color: '#fcd34d', icon: '⏳' },
  admin:       { label: 'Admin',        color: '#fcd34d', icon: '🛡️' },
};

export default function DonorDashboard() {
  const { user, role } = useAuth();
  const meta = ROLE_LABELS[role] || ROLE_LABELS.donor;

  return (
    <div style={{
      maxWidth: '1126px', margin: '0 auto',
      padding: '40px 24px',
    }}>

      {/* Profile card */}
      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '32px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
      }}>
        {user?.photoURL && (
          <img src={user.photoURL} alt="avatar"
            style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid rgba(124,58,237,0.5)' }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px',
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
            {user?.displayName || 'Welcome'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
            {user?.email}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '5px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
            border: `1px solid ${meta.color}40`,
            background: `${meta.color}15`,
            color: meta.color,
          }}>
            {meta.icon} {meta.label}
          </span>
        </div>
      </div>

      {/* ── PENDING NGO — waiting for approval ── */}
      {role === 'pending_ngo' && (
        <div style={{
          borderRadius: '20px', padding: '28px 32px', marginBottom: '24px',
          border: '1px solid rgba(245,158,11,0.35)',
          background: 'rgba(245,158,11,0.08)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fcd34d', marginBottom: '10px',
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
            ⏳ Organization Access Pending
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
            Your organization account request has been submitted and is waiting for admin approval.
            Once approved, you will have access to create and manage donation campaigns.
          </p>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            Tip: Sign out and sign back in after approval to see your Organization dashboard.
          </div>
        </div>
      )}

      {/* ── APPROVED NGO ── */}
      {role === 'ngo' && (
        <div style={{
          borderRadius: '20px', padding: '28px 32px', marginBottom: '24px',
          border: '1px solid rgba(34,211,238,0.35)',
          background: 'rgba(34,211,238,0.06)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#67e8f9', marginBottom: '10px',
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
            🏥 Organization Dashboard
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
            Your organization is approved. You can create campaigns, upload milestone proofs, and manage fund releases.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/ngo" style={{
              padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              background: 'linear-gradient(135deg,#0891b2,#22d3ee)', color: '#fff',
              textDecoration: 'none',
            }}>Go to NGO Dashboard</Link>
            <Link to="/proof" style={{
              padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff',
              textDecoration: 'none',
            }}>Upload Proof</Link>
          </div>
        </div>
      )}

      {/* ── DONOR ── */}
      {role === 'donor' && (
        <div style={{
          borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
          background: '#0d1021', padding: '28px 32px', marginBottom: '24px',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '10px',
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
            🙋 Your Donations
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
            Track your donations, view campaign updates, and see exactly where every rupee went.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/campaigns" style={{
              padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff',
              textDecoration: 'none',
            }}>Browse Campaigns</Link>
            <Link to="/transparency" style={{
              padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff',
              textDecoration: 'none',
            }}>View Transparency</Link>
          </div>
        </div>
      )}

      {/* ── ADMIN ── */}
      {role === 'admin' && (
        <div style={{
          borderRadius: '20px', padding: '28px 32px', marginBottom: '24px',
          border: '1px solid rgba(245,158,11,0.35)',
          background: 'rgba(245,158,11,0.06)',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fcd34d', marginBottom: '10px',
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
            🛡️ Admin Access
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
            You have full admin access. Approve NGO requests, manage campaigns, and oversee the platform.
          </p>
          <Link to="/admin" style={{
            display: 'inline-block', padding: '12px 24px', borderRadius: '12px',
            fontWeight: 700, fontSize: '13px',
            background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff',
            textDecoration: 'none',
          }}>Go to Admin Panel</Link>
        </div>
      )}

    </div>
  );
}