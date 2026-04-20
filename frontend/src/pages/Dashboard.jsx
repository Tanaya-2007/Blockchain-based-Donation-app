import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const TYPE_STYLE = {
  release:  { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7' },
  donation: { background: 'rgba(124,58,237,0.15)',  color: '#c4b5fd' },
  proof:    { background: 'rgba(245,158,11,0.15)',  color: '#fcd34d' },
};

const CAT_COLOR = {
  'Medical / Healthcare': '#a78bfa',
  'Education':            '#22d3ee',
  'Disaster Relief':      '#f87171',
  'Environmental':        '#34d399',
  'Child Welfare':        '#60a5fa',
  'Women Empowerment':    '#f472b6',
  'Animal Welfare':       '#fb923c',
  'Other':                '#94a3b8',
};

export default function Dashboard() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [donations,  setDonations]  = useState([]);
  const [proofs,     setProofs]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [campSnap, donSnap, proofSnap] = await Promise.all([
          getDocs(collection(db, 'campaigns')),
          getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc'))),
          getDocs(collection(db, 'proofs')),
        ]);
        setCampaigns(campSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setDonations(donSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setProofs(proofSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  // Computed stats
  const totalCollected  = donations.reduce((s, d) => s + (d.amount || 0), 0);
  const totalReleased   = donations.filter(d => d.status === 'released').reduce((s, d) => s + (d.amount || 0), 0);
  const totalLocked     = donations.filter(d => d.status === 'locked').reduce((s, d) => s + (d.amount || 0), 0);
  const verifiedProofs  = proofs.filter(p => p.status === 'approved').length;
  const rejectedProofs  = proofs.filter(p => p.status === 'rejected').length;
  const pendingProofs   = proofs.filter(p => p.status === 'pending_admin_review').length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;
  const fmtDate = ts => ts?.seconds
    ? new Date(ts.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '—';

  // Bar chart data — up to last 7 campaigns sorted by raised
  const barCampaigns = [...campaigns]
    .sort((a, b) => (b.raisedAmount || 0) - (a.raisedAmount || 0))
    .slice(0, 7);
  const maxRaised = Math.max(...barCampaigns.map(c => c.raisedAmount || 0), 1);

  // Recent transactions — last 10 donations
  const recentDonations = donations.slice(0, 10);

  const STATS = [
    { label: 'Total Collected',    val: fmt(totalCollected),        sub: `Across ${activeCampaigns} active campaigns`, color: '#a78bfa' },
    { label: 'Funds Released',     val: fmt(totalReleased),         sub: 'After proof verification',                   color: '#34d399' },
    { label: 'Locked in Contract', val: fmt(totalLocked),           sub: 'Milestone pending release',                  color: '#fbbf24' },
    { label: 'AI Verified Proofs', val: verifiedProofs.toString(),  sub: `${rejectedProofs} rejected · ${pendingProofs} pending`, color: '#22d3ee' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>
        Transparency Dashboard
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '36px' }}>
        Real-time fund tracking — publicly verifiable · All data from Firestore
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading live data…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '22px' }}>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px', fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 800, color: s.color, marginBottom: '4px' }}>{s.val}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Bar chart — real campaigns */}
          <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '28px', marginBottom: '20px' }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '24px' }}>
              Fund Flow — Top Campaigns
            </div>

            {barCampaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
                No campaigns yet — data will appear here once NGOs create campaigns.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '160px', marginBottom: '16px' }}>
                  {barCampaigns.map((c, i) => {
                    const raised    = c.raisedAmount || 0;
                    const target    = c.targetAmount || 0;
                    const raisedPct = Math.round((raised / maxRaised) * 100);
                    const releasedPct = Math.round(((c.releasedAmount || 0) / maxRaised) * 100);
                    const lockedPct = Math.max(0, raisedPct - releasedPct);
                    const color     = CAT_COLOR[c.category] || '#a78bfa';
                    return (
                      <div key={c.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: '2px', height: '130px' }}>
                          {/* Raised bar */}
                          <div style={{ flex: 1, borderRadius: '4px 4px 0 0', height: `${raisedPct}%`, background: `linear-gradient(to top,${color}cc,${color})`, minHeight: raisedPct > 0 ? '4px' : '0' }} title={`Raised: ₹${raised.toLocaleString('en-IN')}`} />
                          {/* Target remaining (grey) */}
                          <div style={{ flex: 1, borderRadius: '4px 4px 0 0', height: `${Math.round((target / maxRaised) * 100) - raisedPct}%`, background: 'rgba(255,255,255,0.06)', minHeight: 0 }} title={`Remaining: ₹${Math.max(0, target - raised).toLocaleString('en-IN')}`} />
                        </div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                          {c.title?.split(' ').slice(0, 2).join(' ') || `C${i + 1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {[{ color: '#a78bfa', label: 'Raised' }, { color: 'rgba(255,255,255,0.06)', label: 'Remaining' }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.color }} />
                      {l.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Campaign list */}
          <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700, color: '#fff' }}>
              All Campaigns
            </div>
            {campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No campaigns yet.</div>
            ) : (
              <div>
                {campaigns.map(c => {
                  const raised = c.raisedAmount || 0;
                  const target = c.targetAmount || 0;
                  const pct    = target ? Math.min(Math.round((raised / target) * 100), 100) : 0;
                  return (
                    <div key={c.id} style={{ padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{c.title}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{c.category} · {c.ngoName}</div>
                      </div>
                      <div style={{ minWidth: '120px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>
                          <span>₹{raised.toLocaleString('en-IN')}</span>
                          <span>{pct}%</span>
                        </div>
                        <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : 'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius: '4px' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#22d3ee', minWidth: '90px', textAlign: 'right' }}>
                        {fmt(target)}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', ...(c.status === 'active' ? { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' } : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)' }) }}>
                        {c.status || 'active'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden' }}>
            <div style={{ padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700, color: '#fff' }}>
              Recent Donations
            </div>
            {recentDonations.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>No donations yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Campaign', 'Donor', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentDonations.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 500, color: '#fff', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.campaignTitle || '—'}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.donorName || d.donorEmail || 'Anonymous'}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#22d3ee' }}>
                          ₹{(d.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                          {d.method || '—'}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          {fmtDate(d.createdAt)}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', ...(d.status === 'released' ? { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' } : { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }) }}>
                            {d.status === 'released' ? '✅ Released' : '🔒 Locked'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}