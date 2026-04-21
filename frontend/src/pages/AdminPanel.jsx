import { useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs,
  orderBy, query, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_STYLE = {
  pending:  { background: 'rgba(245,158,11,0.15)',  color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)'  },
  approved: { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)'  },
  rejected: { background: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)'   },
};
const PROOF_STATUS_STYLE = {
  pending_admin_review: { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' },
  approved:             { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)' },
  rejected:             { background: 'rgba(239,68,68,0.15)',  color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)'  },
};
const DOC_LABELS = {
  regCertificate: 'Registration Certificate', panCard: 'PAN Card',
  authLetter: 'Authorisation Letter', cert80G: '80G / 12A Certificate', auditReport: 'Audit Report',
};

/* ─── generic popup (replaces all alert() calls) ─────── */
function InfoPopup({ type, title, message, onClose }) {
  const styles = {
    success: { icon: '✅', border: 'rgba(16,185,129,0.4)',  glow: 'rgba(16,185,129,0.15)', color: '#6ee7b7', btn: 'linear-gradient(135deg,#10b981,#0891b2)' },
    error:   { icon: '❌', border: 'rgba(239,68,68,0.4)',   glow: 'rgba(239,68,68,0.12)',  color: '#fca5a5', btn: 'linear-gradient(135deg,#dc2626,#991b1b)' },
    warning: { icon: '⚠️', border: 'rgba(245,158,11,0.4)', glow: 'rgba(245,158,11,0.12)', color: '#fcd34d', btn: 'linear-gradient(135deg,#d97706,#92400e)' },
  };
  const st = styles[type] || styles.success;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '400px', borderRadius: '22px', border: `1px solid ${st.border}`, background: '#0d1021', padding: '36px', textAlign: 'center', boxShadow: `0 0 48px ${st.glow}` }}>
        <div style={{ fontSize: '48px', marginBottom: '14px' }}>{st.icon}</div>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px' }}>{message}</p>
        <button onClick={onClose} style={{ padding: '12px 32px', borderRadius: '10px', border: 'none', background: st.btn, color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ─── confirm modal ──────────────────────────────────── */
function ConfirmModal({ title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.35)', background: '#0d1021', padding: '32px', textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.12)' }}>
        <div style={{ fontSize: '40px', marginBottom: '14px' }}>⚠️</div>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '11px 24px', borderRadius: '10px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#fff', ...confirmStyle }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── AI verdict badge ───────────────────────────────── */
function VerdictBadge({ score }) {
  if (score == null) return null;
  const s = Number(score);
  const style = s > 85
    ? { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
    : s >= 55
    ? { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }
    : { background: 'rgba(239,68,68,0.15)',  color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)'  };
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', whiteSpace: 'nowrap', ...style }}>
      {s > 85 ? '✅' : s >= 55 ? '🗳️' : '❌'} {s}%
    </span>
  );
}

function DocLink({ url, label }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.1)', color: '#c4b5fd', fontSize: '12px', fontWeight: 600 }}>
      📄 {label} <span style={{ fontSize: '10px', opacity: 0.6 }}>↗</span>
    </a>
  );
}

/* ─── Proofs tab ─────────────────────────────────────── */
function ProofsTab() {
  const [proofs,    setProofs]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [actioning, setActioning] = useState(null);
  const [popup,     setPopup]     = useState(null); // { type, title, message }

  const loadProofs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'proofs'), orderBy('uploadedAt', 'desc')));
      setProofs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadProofs(); }, []);

  const approveProof = async (proof) => {
    setActioning(proof.id);
    try {
      await updateDoc(doc(db, 'proofs', proof.id), { status: 'approved', reviewedAt: new Date() });
      await updateDoc(doc(db, 'campaigns', proof.campaignId), {
        [`milestones.${proof.milestoneNo - 1}.status`]: 'verified',
        currentMilestone: proof.milestoneNo + 1,
      });
      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, status: 'approved' } : p));
      setPopup({
        type: 'success',
        title: 'Milestone Approved!',
        message: `Milestone ${proof.milestoneNo} for "${proof.campaignTitle}" has been approved. Funds have been released to the NGO.`,
      });
    } catch (e) {
      setPopup({ type: 'error', title: 'Approval Failed', message: e.message });
    }
    setActioning(null);
  };

  const rejectProof = async (proof) => {
    setActioning(proof.id);
    try {
      await updateDoc(doc(db, 'proofs', proof.id), { status: 'rejected', reviewedAt: new Date() });
      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, status: 'rejected' } : p));
      setPopup({
        type: 'warning',
        title: 'Proof Rejected',
        message: `Milestone ${proof.milestoneNo} proof for "${proof.campaignTitle}" has been rejected. The NGO will need to resubmit.`,
      });
    } catch (e) {
      setPopup({ type: 'error', title: 'Rejection Failed', message: e.message });
    }
    setActioning(null);
  };

  const shown   = filter === 'all' ? proofs : proofs.filter(p =>
    filter === 'pending' ? p.status === 'pending_admin_review' : p.status === filter
  );
  const pending = proofs.filter(p => p.status === 'pending_admin_review').length;

  return (
    <div>
      {popup && <InfoPopup {...popup} onClose={() => setPopup(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total',    val: proofs.length,                                     color: '#a78bfa' },
          { label: 'Pending',  val: pending,                                             color: '#fcd34d' },
          { label: 'Approved', val: proofs.filter(p => p.status === 'approved').length, color: '#6ee7b7' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '16px 20px' }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>
            Milestone Proofs
            {pending > 0 && <span style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' }}>{pending} pending</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {['all', 'pending', 'approved', 'rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, border: 'none', background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={loadProofs} style={{ padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: '13px' }}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>No milestone proofs found.</div>
        ) : shown.map(proof => (
          <div key={proof.id}>
            <div onClick={() => setExpanded(expanded === proof.id ? null : proof.id)}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', padding: '16px 28px', cursor: 'pointer', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', background: expanded === proof.id ? 'rgba(255,255,255,0.025)' : 'transparent', transition: 'background 0.15s' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proof.campaignTitle || '—'}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{proof.ngoName} · M{proof.milestoneNo}</div>
              </div>
              <VerdictBadge score={proof.aiScore} />
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', ...(PROOF_STATUS_STYLE[proof.status] || PROOF_STATUS_STYLE.pending_admin_review) }}>
                {proof.status === 'pending_admin_review' ? 'Pending' : proof.status}
              </span>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {proof.status === 'pending_admin_review' && (
                  <>
                    <button onClick={() => approveProof(proof)} disabled={actioning === proof.id}
                      style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.35)', whiteSpace: 'nowrap' }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => rejectProof(proof)} disabled={actioning === proof.id}
                      style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)' }}>
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>

            {expanded === proof.id && (
              <div style={{ padding: '20px 28px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.018)' }}>
                {proof.aiSummary && (
                  <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.06)', fontSize: '13px', color: '#c4b5fd' }}>
                    🤖 AI Summary: {proof.aiSummary}
                  </div>
                )}
                {proof.fileUrls?.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Uploaded Documents</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {proof.fileUrls.map((url, i) => <DocLink key={i} url={url} label={`Document ${i + 1}`} />)}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                  Submitted: {proof.uploadedAt?.seconds ? new Date(proof.uploadedAt.seconds * 1000).toLocaleString('en-IN') : '—'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── NGO Requests tab ───────────────────────────────── */
function NgoRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter,   setFilter]   = useState('all');
  const [confirm,  setConfirm]  = useState(null);
  const [popup,    setPopup]    = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'ngoRequests'), orderBy('createdAt', 'desc')));
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchRequests(); }, []);

  const approve = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'approved' });
      await updateDoc(doc(db, 'users', req.uid), { role: 'ngo' });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r));
    } catch (e) { setPopup({ type: 'error', title: 'Failed', message: e.message }); }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'rejected' });
      if (req.status === 'approved') await updateDoc(doc(db, 'users', req.uid), { role: 'donor' });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' } : r));
    } catch (e) { setPopup({ type: 'error', title: 'Failed', message: e.message }); }
    setConfirm(null);
  };

  const deleteOrg = async (req) => {
    try {
      await deleteDoc(doc(db, 'ngoRequests', req.id));
      await updateDoc(doc(db, 'users', req.uid), { role: 'donor' });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      if (expanded === req.id) setExpanded(null);
    } catch (e) { setPopup({ type: 'error', title: 'Failed', message: e.message }); }
    setConfirm(null);
  };

  const pending = requests.filter(r => r.status === 'pending').length;
  const shown   = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const ActionBtns = ({ req }) => (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
      {req.status === 'pending' && (
        <>
          <button onClick={() => approve(req)} style={{ padding: '5px 10px', borderRadius: '7px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.35)', whiteSpace: 'nowrap' }}>✓ Approve</button>
          <button onClick={() => setConfirm({ type: 'reject', req })} style={{ padding: '5px 10px', borderRadius: '7px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap' }}>✕ Reject</button>
        </>
      )}
      {req.status === 'approved' && (
        <button onClick={() => setConfirm({ type: 'reject', req })} style={{ padding: '5px 10px', borderRadius: '7px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap' }}>Revoke</button>
      )}
      {req.status === 'rejected' && (
        <button onClick={() => approve(req)} style={{ padding: '5px 10px', borderRadius: '7px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'nowrap' }}>Re-approve</button>
      )}
      <button onClick={() => setConfirm({ type: 'delete', req })} style={{ padding: '5px 9px', borderRadius: '7px', background: 'rgba(127,29,29,0.4)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)' }} title="Delete permanently">🗑</button>
    </div>
  );

  return (
    <>
      {popup && <InfoPopup {...popup} onClose={() => setPopup(null)} />}
      {confirm?.type === 'reject' && (
        <ConfirmModal title="Reject this organisation?" message={`This will mark ${confirm.req.orgName || confirm.req.name || 'this organisation'} as rejected.`} confirmLabel="Yes, Reject" confirmStyle={{ background: 'rgba(239,68,68,0.8)' }} onConfirm={() => reject(confirm.req)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmModal title="Permanently delete?" message={`This will permanently remove ${confirm.req.orgName || confirm.req.name || 'this organisation'} and revoke all their access. This cannot be undone.`} confirmLabel="Yes, Delete Permanently" confirmStyle={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }} onConfirm={() => deleteOrg(confirm.req)} onCancel={() => setConfirm(null)} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total',    val: requests.length,                                     color: '#a78bfa' },
          { label: 'Pending',  val: requests.filter(r => r.status === 'pending').length,  color: '#fcd34d' },
          { label: 'Approved', val: requests.filter(r => r.status === 'approved').length, color: '#6ee7b7' },
          { label: 'Rejected', val: requests.filter(r => r.status === 'rejected').length, color: '#fca5a5' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '16px 20px' }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>
            NGO Requests
            {pending > 0 && <span style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' }}>{pending} pending</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {['all', 'pending', 'approved', 'rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, border: 'none', background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={fetchRequests} style={{ padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: '13px' }}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>No requests found.</div>
        ) : shown.map(req => (
          <div key={req.id}>
            <div onClick={() => setExpanded(expanded === req.id ? null : req.id)}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', padding: '16px 28px', cursor: 'pointer', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', background: expanded === req.id ? 'rgba(255,255,255,0.025)' : 'transparent', transition: 'background 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {req.photoURL
                  ? <img src={req.photoURL} alt={req.name} referrerPolicy="no-referrer" style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(req.name || req.email || '?')[0].toUpperCase()}</div>
                }
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name || '—'}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.orgName || req.email}</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', ...(STATUS_STYLE[req.status] || STATUS_STYLE.pending) }}>
                {req.status || 'pending'}
              </span>
              <ActionBtns req={req} />
            </div>

            {expanded === req.id && (
              <div style={{ padding: '24px 28px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.018)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                  {[
                    { label: 'Email',          val: req.email           },
                    { label: 'Org type',       val: req.orgType         },
                    { label: 'Reg number',     val: req.regNumber       },
                    { label: 'Year est.',      val: req.yearEstablished  },
                    { label: 'Location',       val: req.city && req.state ? `${req.city}, ${req.state}` : req.city || req.state },
                    { label: 'Contact person', val: req.contactName     },
                    { label: 'Phone',          val: req.contactPhone    },
                    { label: 'Website',        val: req.website         },
                    { label: 'Submitted',      val: req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                  ].filter(f => f.val).map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{f.label}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', wordBreak: 'break-word' }}>
                        {f.label === 'Website' ? <a href={f.val} target="_blank" rel="noreferrer" style={{ color: '#67e8f9', textDecoration: 'none' }}>{f.val}</a> : f.val}
                      </div>
                    </div>
                  ))}
                </div>
                {req.description && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Mission / Description</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>{req.description}</div>
                  </div>
                )}
                {req.documents && Object.keys(req.documents).some(k => req.documents[k]) ? (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Uploaded Documents</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {Object.entries(req.documents).map(([key, url]) => url && <DocLink key={key} url={url} label={DOC_LABELS[key] || key} />)}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginBottom: '16px' }}>No documents uploaded with this request.</div>
                )}
                <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#fca5a5', marginBottom: '3px' }}>Danger Zone</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Permanently delete this organisation and revoke all access.</div>
                  </div>
                  <button onClick={() => setConfirm({ type: 'delete', req })} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                    🗑️ Delete Organisation
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Main AdminPanel ────────────────────────────────── */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('ngos');
  return (
    <div style={{ padding: '40px 24px', maxWidth: '1100px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#f59e0b', marginBottom: '8px' }}>Admin</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>Admin Panel</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '28px' }}>Manage NGO registrations, review milestone proofs, and control fund releases.</p>
      <div style={{ display: 'flex', marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {[{ id: 'ngos', label: '🏢 NGO Requests' }, { id: 'proofs', label: '📄 Milestone Proofs' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '12px 24px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, background: 'transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.35)', borderBottom: activeTab === tab.id ? '2px solid #7c3aed' : '2px solid transparent', marginBottom: '-1px', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'ngos'   && <NgoRequestsTab />}
      {activeTab === 'proofs' && <ProofsTab />}
    </div>
  );
}