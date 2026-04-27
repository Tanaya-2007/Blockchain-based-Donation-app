import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';

export default function NgoCampaignsDashboard({ user }) {
  const [campaigns, setCampaigns] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);
    
    // Real-time listen to this NGO's campaigns
    const unsubCamps = onSnapshot(query(collection(db, 'campaigns'), where('ngoId', '==', user.uid)), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // Real-time listen to this NGO's uploaded proofs
    const unsubProofs = onSnapshot(query(collection(db, 'proofs'), where('ngoId', '==', user.uid)), (snap) => {
      setProofs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubCamps();
      unsubProofs();
    };
  }, [user?.uid]);

  // Derived Campaign Data (Independent Logic per Campaign)
  const enhancedCampaigns = useMemo(() => {
    return campaigns.map(c => {
      const raised = c.raisedAmount || 0;
      const target = c.targetAmount || 0;
      const released = c.releasedFunds || 0;
      const locked = Math.max(0, raised - released);
      const remainingTarget = Math.max(0, target - raised);
      const donors = c.donorCount || 0;
      
      const milestones = Array.isArray(c.milestones) ? c.milestones : Object.values(c.milestones || {});
      const completedMilestones = milestones.filter(m => m.status === 'verified').length;
      const totalMilestones = milestones.length || 1;
      const currentMilestoneIdx = c.currentMilestone ? c.currentMilestone - 1 : completedMilestones;
      const nextMilestone = milestones[currentMilestoneIdx] || null;
      const nextMilestoneAmt = nextMilestone?.amount || (target / totalMilestones);

      // Find proof status for the CURRENT milestone
      const activeProof = proofs.find(p => p.campaignId === c.id && p.milestoneNo === currentMilestoneIdx + 1);
      let proofStatus = 'none'; // none | pending_upload | under_review | rejected
      
      if (activeProof) {
        if (activeProof.status === 'pending_admin_review') proofStatus = 'under_review';
        else if (activeProof.status === 'rejected') proofStatus = 'rejected';
      } else if (locked >= nextMilestoneAmt && currentMilestoneIdx < totalMilestones) {
        proofStatus = 'pending_upload';
      }

      // Overall Campaign Status
      let status = 'Active';
      if (c.status === 'halted_rejected') status = 'Refunded / Halted';
      else if (completedMilestones >= totalMilestones) status = 'Completed';
      else if (proofStatus === 'pending_upload') status = 'Needs Proof';
      else if (proofStatus === 'under_review') status = 'Under Review';
      else if (locked >= nextMilestoneAmt) status = 'Ready for Release';

      const daysRemaining = c.deadline?.seconds 
        ? Math.max(0, Math.ceil((c.deadline.seconds * 1000 - Date.now()) / 86400000))
        : null;

      return {
        ...c,
        raised, target, released, locked, remainingTarget, donors,
        completedMilestones, totalMilestones, nextMilestoneAmt, currentMilestoneIdx,
        proofStatus, status, daysRemaining,
        milestonesArr: milestones
      };
    });
  }, [campaigns, proofs]);

  // Filtering
  const filteredCampaigns = useMemo(() => {
    return enhancedCampaigns.filter(c => {
      const matchSearch = c.title?.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'All' || c.status === filter || (filter === 'Active' && !['Completed', 'Under Review'].includes(c.status));
      return matchSearch && matchFilter;
    }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [enhancedCampaigns, search, filter]);

  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Syncing campaigns...</div>;

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '36px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#10b981', marginBottom: '8px' }}>Individual Tracking</div>
          <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Campaign Dashboard
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '6px' }}>Manage proofs, track funds, and monitor real-time progress for each campaign independently.</p>
        </div>
        <Link to="/create-campaign" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', background: 'linear-gradient(135deg,#10b981,#0891b2)', color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
          + New Campaign
        </Link>
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '28px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['All', 'Active', 'Needs Proof', 'Under Review', 'Completed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '8px 20px', borderRadius: '999px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: 'none', transition: 'all 0.2s',
              background: filter === f ? 'rgba(124,58,237,0.2)' : 'transparent',
              color: filter === f ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
            }}>{f}</button>
          ))}
        </div>
        <input 
          type="text" placeholder="Search campaign..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '250px', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '13px', outline: 'none' }}
        />
      </div>

      {/* Campaigns Grid */}
      {filteredCampaigns.length === 0 ? (
        <div style={{ padding: '80px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>No campaigns found matching your criteria.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {filteredCampaigns.map(c => (
            <div key={c.id} style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(145deg, #11142b, #0a0c1a)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              
              {/* Card Header */}
              <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: 0 }}>{c.title}</h3>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.5px', 
                      background: c.status === 'Refunded / Halted' ? 'rgba(239,68,68,0.15)' : c.status === 'Completed' ? 'rgba(16,185,129,0.15)' : c.status === 'Needs Proof' ? 'rgba(245,158,11,0.15)' : c.status === 'Under Review' ? 'rgba(124,58,237,0.15)' : 'rgba(34,211,238,0.15)',
                      color: c.status === 'Refunded / Halted' ? '#fca5a5' : c.status === 'Completed' ? '#6ee7b7' : c.status === 'Needs Proof' ? '#fcd34d' : c.status === 'Under Review' ? '#c4b5fd' : '#67e8f9',
                      border: `1px solid ${c.status === 'Refunded / Halted' ? 'rgba(239,68,68,0.3)' : c.status === 'Completed' ? 'rgba(16,185,129,0.3)' : c.status === 'Needs Proof' ? 'rgba(245,158,11,0.3)' : c.status === 'Under Review' ? 'rgba(124,58,237,0.3)' : 'rgba(34,211,238,0.3)'}`
                    }}>
                      {c.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', gap: '16px' }}>
                    <span>📅 Created: {c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toLocaleDateString() : '—'}</span>
                    {c.daysRemaining !== null && <span>⏳ {c.daysRemaining} days remaining</span>}
                    <span>👥 {c.donors} Donors</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Target Amount</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#22d3ee' }}>{fmt(c.target)}</div>
                </div>
              </div>

              {/* Financial Meters */}
              <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', background: 'rgba(255,255,255,0.01)' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Total Donated</span>
                    <span style={{ fontWeight: 700, color: '#a78bfa' }}>{fmt(c.raised)}</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: '6px', width: `${Math.min(100, (c.raised / c.target) * 100)}%`, background: '#8b5cf6' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '8px', textAlign: 'right' }}>{fmt(c.remainingTarget)} needed</div>
                </div>
                
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Locked (Safety)</span>
                    <span style={{ fontWeight: 700, color: '#fbbf24' }}>{fmt(c.locked)}</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: '6px', width: `${Math.min(100, (c.locked / c.raised) * 100 || 0)}%`, background: '#f59e0b' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Released to NGO</span>
                    <span style={{ fontWeight: 700, color: '#10b981' }}>{fmt(c.released)}</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: '6px', width: `${Math.min(100, (c.released / c.raised) * 100 || 0)}%`, background: '#10b981' }} />
                  </div>
                </div>
              </div>

              {/* Milestones & Actions */}
              <div style={{ padding: '24px 32px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
                
                {/* Milestone Stepper */}
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                    Milestone Progress ({c.completedMilestones}/{c.totalMilestones})
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {c.milestonesArr.map((m, idx) => {
                      const isCompleted = m.status === 'verified';
                      const isCurrent = idx === c.currentMilestoneIdx && c.status !== 'Completed';
                      return (
                        <div key={idx} style={{ flex: 1, height: '4px', borderRadius: '4px', background: isCompleted ? '#10b981' : isCurrent ? '#fbbf24' : 'rgba(255,255,255,0.08)', position: 'relative' }}>
                          {isCurrent && (
                            <div style={{ position: 'absolute', top: '12px', left: 0, fontSize: '10px', color: '#fbbf24', whiteSpace: 'nowrap', fontWeight: 700 }}>
                              {fmt(m.amount)} Active
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Smart Actions */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {c.proofStatus === 'rejected' && (
                    <div style={{ padding: '8px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      ⚠️ Proof Rejected — Re-upload required
                    </div>
                  )}

                  {(c.proofStatus === 'pending_upload' || c.proofStatus === 'rejected') && (
                    <Link to="/proof" state={{ campaignId: c.id }} style={{ padding: '10px 20px', borderRadius: '10px', background: 'linear-gradient(135deg,#f59e0b,#ea580c)', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                      📄 Upload Milestone Proof
                    </Link>
                  )}

                  {c.proofStatus === 'under_review' && (
                    <div style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', color: '#c4b5fd', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', animation: 'pulse 2s infinite' }} /> Admin Review Pending
                    </div>
                  )}

                  <Link to="/transparency" style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s' }}>
                    View Analytics
                  </Link>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
