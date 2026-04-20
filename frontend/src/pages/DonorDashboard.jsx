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
    <div style={{ padding: '40px 48px', maxWidth: '800px' }}>

      {/* ── Profile card ── */}
      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '28px',
        display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px',
      }}>
        {user?.photoURL ? (
          <img src={user.photoURL} alt={user.displayName || 'avatar'} referrerPolicy="no-referrer"
            style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${meta.border}` }} />
        ) : (
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 800, color: '#fff', border: `2px solid ${meta.border}` }}>
            {(user?.displayName?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
            {user?.displayName || 'User'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>{user?.email}</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
        </div>

        {role === 'admin' && (
          <Link to="/admin" style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
            🛡️ Admin Panel →
          </Link>
        )}
        {role === 'ngo' && (
          <Link to="/ngo" style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
            🏥 NGO Dashboard →
          </Link>
        )}
      </div>

      {/* ── Donation stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total donated', val: `₹${totalDonated.toLocaleString('en-IN')}`, color: '#a78bfa' },
          { label: 'Locked (pending)', val: `₹${totalLocked.toLocaleString('en-IN')}`, color: '#fcd34d' },
          { label: 'Released', val: `₹${totalReleased.toLocaleString('en-IN')}`, color: '#6ee7b7' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 800, color: s.color, marginBottom: '4px' }}>{s.val}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Donation history ── */}
      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '16px', fontWeight: 700, color: '#fff' }}>
            💳 Your Donations
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6ee7b7' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6ee7b7', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Live
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading your donations…</div>
        ) : donations.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>💳</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>No donations yet.</div>
            <Link to="/campaigns" style={{ display: 'inline-block', marginTop: '14px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#c4b5fd', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
              Browse Campaigns →
            </Link>
          </div>
        ) : (
          <div>
            {donations.map(d => {
              const camp = campaigns[d.campaignId];
              const pct  = camp?.targetAmount ? Math.min(Math.round(((camp.raisedAmount || 0) / camp.targetAmount) * 100), 100) : 0;
              return (
                <div key={d.id} style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                      {d.campaignTitle || camp?.title || 'Campaign'}
                    </div>
                    {camp && (
                      <div style={{ height: '3px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: '4px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius: '3px' }} />
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                      {d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleString('en-IN') : '—'}
                      {d.method && ` · via ${d.method}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#22d3ee', marginBottom: '4px' }}>
                      ₹{(d.amount || 0).toLocaleString('en-IN')}
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
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
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Link to="/campaigns" style={{ padding: '11px 22px', borderRadius: '10px', background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
          Browse Campaigns
        </Link>
        <Link to="/transparency" style={{ padding: '11px 22px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
          View Transparency
        </Link>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}