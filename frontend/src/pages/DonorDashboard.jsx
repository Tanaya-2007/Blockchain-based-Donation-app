import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, doc, getDocs, onSnapshot,
  orderBy, query, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const ROLE_META = {
  admin: { label: 'Admin', icon: '🛡️', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  ngo:   { label: 'NGO',   icon: '🏥', color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  donor: { label: 'Donor', icon: '💳', color: '#c4b5fd', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.35)' },
};

export default function DonorDashboard() {
  const { user, role } = useAuth();
  const meta = ROLE_META[role] || ROLE_META.donor;

  const [donations,  setDonations]  = useState([]);
  const [campaigns,  setCampaigns]  = useState({});   // map of campaignId → campaign data
  // ── Initialize loading as true so no sync setState inside useEffect ──
  const [loading,    setLoading]    = useState(true);

  const fetchedCampIds = useRef(new Set());

  useEffect(() => {
    if (!user) return;

    // Single onSnapshot on donations — index is now created (donorId + createdAt)
    const q = query(
      collection(db, 'donations'),
      where('donorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDonations(list);
      setLoading(false);   // ← inside callback = fine, not synchronous in effect body

      // Fetch campaign data for any new campaign IDs we haven't fetched yet
      const newIds = [...new Set(list.map(d => d.campaignId).filter(Boolean))]
        .filter(id => !fetchedCampIds.current.has(id));

      if (newIds.length === 0) return;

      try {
        const results = await Promise.all(
          newIds.map(id => getDocs(query(collection(db, 'campaigns'), where('__name__', '==', id))))
        );
        const newCamps = {};
        results.forEach(snap => {
          snap.docs.forEach(d => { newCamps[d.id] = { id: d.id, ...d.data() }; });
        });
        newIds.forEach(id => fetchedCampIds.current.add(id));
        setCampaigns(prev => ({ ...prev, ...newCamps }));
      } catch (e) {
        console.error('Campaign fetch error:', e);
      }
    }, err => {
      console.error('DonorDashboard listener error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const totalDonated = donations.reduce((s, d) => s + (d.amount || 0), 0);
  const totalLocked  = donations.filter(d => d.status === 'locked').reduce((s, d) => s + (d.amount || 0), 0);
  const totalReleased= donations.filter(d => d.status === 'released').reduce((s, d) => s + (d.amount || 0), 0);

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1000px', margin: '0 auto', minHeight: 'calc(100vh - 68px)' }}>

      {/* ── Profile card ── */}
      <div style={{
        borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(145deg, #11142b, #0a0c1a)', padding: '36px',
        display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)'
      }}>
        {user?.photoURL ? (
          <img src={user.photoURL} alt={user.displayName || 'avatar'} referrerPolicy="no-referrer"
            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `3px solid ${meta.color}`, padding: '4px', background: 'rgba(255,255,255,0.05)' }} />
        ) : (
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, color: '#fff', border: `3px solid ${meta.color}`, padding: '4px', backgroundClip: 'content-box' }}>
            {(user?.displayName?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '6px', letterSpacing: '-0.5px' }}>
            {user?.displayName || 'Welcome Back'}
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px' }}>{user?.email}</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
            {meta.icon} {meta.label} Account
          </span>
        </div>

        {role === 'admin' && (
          <Link to="/admin" style={{ padding: '12px 24px', borderRadius: '12px', background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(217,119,6,0.2))', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d', fontWeight: 700, fontSize: '14px', textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(245,158,11,0.1)' }}>
            🛡️ Admin Panel →
          </Link>
        )}
        {role === 'ngo' && (
          <Link to="/ngo" style={{ padding: '12px 24px', borderRadius: '12px', background: 'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.2))', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', fontWeight: 700, fontSize: '14px', textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(16,185,129,0.1)' }}>
            🏥 NGO Dashboard →
          </Link>
        )}
      </div>

      {/* ── Donation stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {[
          { label: 'Total Donated', val: `₹${totalDonated.toLocaleString('en-IN')}`, color: '#a78bfa', icon: '💎' },
          { label: 'Locked (Pending)', val: `₹${totalLocked.toLocaleString('en-IN')}`, color: '#fbbf24', icon: '🔒' },
          { label: 'Released to NGOs', val: `₹${totalReleased.toLocaleString('en-IN')}`, color: '#34d399', icon: '✅' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(145deg, #11142b, #0a0c1a)', padding: '28px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.04 }}>{s.icon}</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Donation history ── */}
      <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', overflow: 'hidden', marginBottom: '32px' }}>
        <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: 800, color: '#fff' }}>
            💳 Your Donation History
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', fontSize: '12px', fontWeight: 700 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Live Sync
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading your transactions…</div>
        ) : donations.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px', marginBottom: '24px' }}>No donations yet. Make an impact today!</div>
            <Link to="/campaigns" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '12px', background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
              Browse Campaigns
            </Link>
          </div>
        ) : (
          <div>
            {donations.map(d => {
              const camp = campaigns[d.campaignId];
              const pct  = camp?.targetAmount ? Math.min(Math.round(((camp.raisedAmount || 0) / camp.targetAmount) * 100), 100) : 0;
              return (
                <div key={d.id} style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: '24px', transition: 'background 0.2s' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                      {d.campaignTitle || camp?.title || 'Unknown Campaign'}
                    </div>
                    {camp && (
                      <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: '8px', width: '100%', maxWidth: '300px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius: '4px' }} />
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '12px' }}>
                      <span>📅 {d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}</span>
                      {d.method && <span>🏷️ via {d.method}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#22d3ee', marginBottom: '8px' }}>
                      ₹{(d.amount || 0).toLocaleString('en-IN')}
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.5px',
                      ...(d.status === 'locked'
                        ? { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }
                        : { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
                      ),
                    }}>
                      {d.status === 'locked' ? '🔒 Locked' : '✓ Released'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/campaigns" style={{ padding: '12px 28px', borderRadius: '12px', background: 'linear-gradient(135deg,#10b981,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
          Browse New Campaigns
        </Link>
        <Link to="/transparency" style={{ padding: '12px 28px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none', transition: 'background 0.2s' }}>
          View Real-time Transparency
        </Link>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}