import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc, collection, getDocs,
  limit, query, serverTimestamp, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const ROLE_META = {
  admin: { label: 'Admin',     icon: '🛡️', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  ngo:   { label: 'NGO',       icon: '🏥', color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  donor: { label: 'Donor',     icon: '💳', color: '#c4b5fd', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.35)' },
};

export default function DonorDashboard() {
  const { user, role } = useAuth();
  const [reqSent, setReqSent] = useState(false);
  const meta = ROLE_META[role] || ROLE_META.donor;

  const requestNgoAccess = async () => {
    if (!user) return;
    const existing = await getDocs(
      query(collection(db, 'ngoRequests'), where('uid', '==', user.uid), limit(5))
    );
    const hasPending = existing.docs.some(d => d.data()?.status === 'pending');
    if (hasPending) { alert('You already have a pending request.'); return; }
    await addDoc(collection(db, 'ngoRequests'), {
      uid: user.uid, email: user.email || '',
      name: user.displayName || '', photoURL: user.photoURL || '',
      status: 'pending', createdAt: serverTimestamp(),
    });
    setReqSent(true);
  };

  return (
    <div style={{ padding: '40px 48px', maxWidth: '720px' }}>

      {/* ── Profile card ── */}
      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '28px',
        display: 'flex', alignItems: 'center', gap: '20px',
        marginBottom: '20px',
      }}>
        {/* Google avatar */}
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'avatar'}
            referrerPolicy="no-referrer"
            style={{
              width: '64px', height: '64px', borderRadius: '50%',
              objectFit: 'cover', flexShrink: 0,
              border: `2px solid ${meta.border}`,
            }}
          />
        ) : (
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', fontWeight: 800, color: '#fff',
            border: `2px solid ${meta.border}`,
          }}>
            {(user?.displayName?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px',
          }}>
            {user?.displayName || 'User'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
            {user?.email}
          </div>
          {/* Role pill */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
            background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
          }}>
            {meta.icon} {meta.label}
          </span>
        </div>

        {/* Quick links by role */}
        {role === 'admin' && (
          <Link to="/admin" style={{
            padding: '10px 20px', borderRadius: '10px',
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)',
            color: '#fcd34d', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
          }}>
            🛡️ Admin Panel →
          </Link>
        )}
        {role === 'ngo' && (
          <Link to="/ngo" style={{
            padding: '10px 20px', borderRadius: '10px',
            background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)',
            color: '#6ee7b7', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
          }}>
            🏥 NGO Dashboard →
          </Link>
        )}
      </div>

      {/* ── Donations card ── */}
      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '28px', marginBottom: '20px',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
          💳 Your Donations
        </div>
        <div style={{
          fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.65,
          marginBottom: '20px',
        }}>
          Track your donations, view campaign updates, and see exactly where every rupee went.
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/campaigns" style={{
            padding: '11px 22px', borderRadius: '10px',
            background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
            color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
          }}>Browse Campaigns</Link>
          <Link to="/transparency" style={{
            padding: '11px 22px', borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
          }}>View Transparency</Link>
        </div>
      </div>

      {/* ── NGO upgrade card — only for donors ── */}
      {role === 'donor' && (
        <div style={{
          borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
          background: '#0d1021', padding: '28px',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '2px',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px',
          }}>NGO / Organisation access</div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: '16px' }}>
            Are you running an NGO, hospital, or relief organisation? Register to create and
            manage fundraising campaigns on TransparentFund.
          </div>

          {reqSent ? (
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              border: '1px solid rgba(16,185,129,0.35)',
              background: 'rgba(16,185,129,0.1)',
              fontSize: '13px', color: '#6ee7b7', lineHeight: 1.6,
            }}>
              ✓ Request submitted — an admin will review it. Sign out and back in after approval.
            </div>
          ) : (
            <>
              <Link to="/ngo" style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '11px 22px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
              }}>
                Register Organisation →
              </Link>
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
                After approval, sign out and sign back in to access the NGO dashboard.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}