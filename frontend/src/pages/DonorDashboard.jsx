import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, doc, onSnapshot,
  orderBy, query, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const ROLE_META = {
  admin: { label: 'Admin', icon: '🛡️', color: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  ngo:   { label: 'NGO',   icon: '🏥', color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  donor: { label: 'Donor', icon: '💳', color: '#c4b5fd', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.35)' },
};

const STATUS_STYLE = {
  locked:   { background: 'rgba(245,158,11,0.15)',  color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)',  icon: '🔒', label: 'Locked'   },
  released: { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)',  icon: '✅', label: 'Released' },
  pending:  { background: 'rgba(245,158,11,0.15)',  color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)',  icon: '⏳', label: 'Pending'  },
  rejected: { background: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)',   icon: '❌', label: 'Rejected' },
};

const METHOD_ICON = { UPI: '📱', Card: '💳', NetBanking: '🏦' };

export default function DonorDashboard() {
  const { user, role } = useAuth();
  const meta = ROLE_META[role] || ROLE_META.donor;

  const [donations,  setDonations]  = useState([]);
  const [campaigns,  setCampaigns]  = useState({}); // id → live campaign data
  const [loading,    setLoading]    = useState(true);

  /* ── Real-time listener for donor's donations ── */
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'donations'),
      where('donorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );

    // onSnapshot fires immediately with current data, then on every change
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDonations(list);
      setLoading(false);

      // Subscribe to each unique campaign for live progress updates
      const uniqueIds = [...new Set(list.map(d => d.campaignId).filter(Boolean))];
      uniqueIds.forEach(campId => {
        // Only subscribe if not already subscribed
        setCampaigns(prev => {
          if (prev[campId]) return prev; // already have a listener
          return prev;
        });
        onSnapshot(doc(db, 'campaigns', campId), campSnap => {
          if (campSnap.exists()) {
            setCampaigns(prev => ({ ...prev, [campId]: campSnap.data() }));
          }
        });
      });
    }, err => {
      console.error('DonorDashboard listener error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  /* ── Aggregate stats — recalculate whenever donations change ── */
  const totalDonated  = donations.reduce((s, d) => s + (d.amount || 0), 0);
  const totalLocked   = donations.filter(d => d.status === 'locked').reduce((s, d) => s + (d.amount || 0), 0);
  const totalReleased = donations.filter(d => d.status === 'released').reduce((s, d) => s + (d.amount || 0), 0);
  const uniqueCamps   = new Set(donations.map(d => d.campaignId)).size;

  const fmt     = n  => `₹${(n || 0).toLocaleString('en-IN')}`;
  const fmtDate = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div style={{ padding: '40px 48px', maxWidth: '900px' }}>

      {/* ── Profile card ── */}
      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '28px', display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
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

      {/* ── Impact stats — update in real time ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Donated',       val: fmt(totalDonated),  color: '#a78bfa', icon: '💜' },
          { label: 'Funds Locked',         val: fmt(totalLocked),   color: '#fcd34d', icon: '🔒' },
          { label: 'Funds Released',       val: fmt(totalReleased), color: '#6ee7b7', icon: '✅' },
          { label: 'Campaigns Supported',  val: uniqueCamps.toString(), color: '#22d3ee', icon: '🎯' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '20px' }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>{s.icon}</div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '22px', fontWeight: 800, color: s.color, marginBottom: '4px' }}>{s.val}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Donation history — updates instantly via onSnapshot ── */}
      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '18px', fontWeight: 700, color: '#fff' }}>
            💳 Your Donation History
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Live indicator */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
              Live
            </span>
            <Link to="/campaigns" style={{ padding: '8px 18px', borderRadius: '8px', background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '12px', textDecoration: 'none' }}>
              + Donate More
            </Link>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading your donations…</div>
        ) : donations.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>No donations yet</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>Your donation history will appear here after you contribute to a campaign.</div>
            <Link to="/campaigns" style={{ padding: '11px 24px', borderRadius: '10px', background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
              Browse Campaigns
            </Link>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.7fr 0.8fr 0.7fr', padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Campaign', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{h}</div>
              ))}
            </div>

            {donations.map(d => {
              const camp   = campaigns[d.campaignId];
              const st     = STATUS_STYLE[d.status] || STATUS_STYLE.locked;
              const raised = camp?.raisedAmount || 0;
              const target = camp?.targetAmount || 0;
              const pct    = target ? Math.min(Math.round((raised / target) * 100), 100) : 0;

              return (
                <div key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.7fr 0.8fr 0.7fr', padding: '16px 28px', alignItems: 'center' }}>
                    {/* Campaign */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.campaignTitle || 'Unknown Campaign'}
                      </div>
                      {camp && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
                          {pct}% funded · M{camp.currentMilestone || 1} of {camp.milestones?.length || '?'}
                        </div>
                      )}
                    </div>
                    {/* Amount */}
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#22d3ee' }}>
                      ₹{(d.amount || 0).toLocaleString('en-IN')}
                    </div>
                    {/* Method */}
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                      {METHOD_ICON[d.method] || '💰'} {d.method || '—'}
                    </div>
                    {/* Date */}
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                      {fmtDate(d.createdAt)}
                    </div>
                    {/* Status */}
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', background: st.background, color: st.color, border: st.border }}>
                      {st.icon} {st.label}
                    </span>
                  </div>

                  {/* Campaign progress bar — live */}
                  {camp && (
                    <div style={{ padding: '0 28px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, height: '3px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                        ₹{raised.toLocaleString('en-IN')} / ₹{target.toLocaleString('en-IN')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Locked funds explanation ── */}
      {totalLocked > 0 && (
        <div style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)', fontSize: '13px', color: '#fcd34d', lineHeight: 1.7, marginBottom: '20px' }}>
          🔒 <strong>₹{totalLocked.toLocaleString('en-IN')} is currently locked.</strong> It will be released automatically once the NGO uploads milestone proof and AI verifies it.
        </div>
      )}

      {/* ── NGO upgrade card — only for donors ── */}
      {role === 'donor' && (
        <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>NGO / Organisation access</div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: '16px' }}>
            Running an NGO or relief organisation? Register to create and manage fundraising campaigns on TransparentFund.
          </div>
          <Link to="/ngo" style={{ display: 'inline-flex', alignItems: 'center', padding: '11px 22px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
            Register Organisation →
          </Link>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
            After approval, sign out and sign back in to access the NGO dashboard.
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}