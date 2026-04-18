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

const DOC_LABELS = {
  regCertificate: 'Registration Certificate',
  panCard:        'PAN Card',
  authLetter:     'Authorisation Letter',
  cert80G:        '80G / 12A Certificate',
  auditReport:    'Audit Report',
};

/* ─── confirm modal ──────────────────────────────────── */
function ConfirmModal({ title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', borderRadius: '20px',
        border: '1px solid rgba(239,68,68,0.35)', background: '#0d1021',
        padding: '32px', textAlign: 'center',
        boxShadow: '0 0 40px rgba(239,68,68,0.12)',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '14px' }}>⚠️</div>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '10px',
        }}>{title}</h3>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7, marginBottom: '24px' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{
            padding: '11px 24px', borderRadius: '10px', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
            color: '#fff', fontWeight: 600, fontSize: '13px',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '11px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '13px', color: '#fff', ...confirmStyle,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter,   setFilter]   = useState('all');

  // Confirm modal state
  const [confirm, setConfirm] = useState(null);
  // { type: 'reject' | 'delete', req }

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'ngoRequests'), orderBy('createdAt', 'desc'))
      );
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Failed to fetch NGO requests:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const approve = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'approved' });
      await updateDoc(doc(db, 'users', req.uid),       { role: 'ngo' });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r));
    } catch (e) { alert('Failed to approve: ' + e.message); }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'rejected' });
      // If they were previously approved, revoke NGO role back to donor
      if (req.status === 'approved') {
        await updateDoc(doc(db, 'users', req.uid), { role: 'donor' });
      }
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' } : r));
    } catch (e) { alert('Failed to reject: ' + e.message); }
    setConfirm(null);
  };

  const deleteOrg = async (req) => {
    try {
      // Delete the ngoRequest doc
      await deleteDoc(doc(db, 'ngoRequests', req.id));
      // Downgrade user role back to donor
      await updateDoc(doc(db, 'users', req.uid), { role: 'donor' });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      if (expanded === req.id) setExpanded(null);
    } catch (e) { alert('Failed to delete: ' + e.message); }
    setConfirm(null);
  };

  const pending  = requests.filter(r => r.status === 'pending').length;
  const shown    = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1100px' }}>

      {/* Confirm modal */}
      {confirm?.type === 'reject' && (
        <ConfirmModal
          title="Reject this organisation?"
          message={`This will mark ${confirm.req.orgName || confirm.req.name || 'this organisation'} as rejected. If they were approved, their NGO access will be revoked.`}
          confirmLabel="Yes, Reject"
          confirmStyle={{ background: 'rgba(239,68,68,0.8)' }}
          onConfirm={() => reject(confirm.req)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmModal
          title="Permanently delete this organisation?"
          message={`This will permanently remove ${confirm.req.orgName || confirm.req.name || 'this organisation'} from the platform and revoke all their access. This cannot be undone.`}
          confirmLabel="Yes, Delete Permanently"
          confirmStyle={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}
          onConfirm={() => deleteOrg(confirm.req)}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#f59e0b', marginBottom: '8px' }}>Admin</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>Admin panel</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '36px' }}>
        Review organisation registration requests, verify documents, approve, reject, or delete.
      </p>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total',    val: requests.length,                                    color: '#a78bfa' },
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

      {/* Main card */}
      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>
            NGO Requests
            {pending > 0 && (
              <span style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' }}>
                {pending} pending
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {['all', 'pending', 'approved', 'rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 14px', borderRadius: '999px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, border: 'none',
                background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
            <button onClick={fetchRequests} style={{ padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: '13px' }}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>No requests found.</div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 0.7fr 1.4fr', padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Applicant', 'Email', 'Organisation', 'Status', 'Actions'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{h}</div>
              ))}
            </div>

            {shown.map(req => (
              <div key={req.id}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 0.7fr 1.4fr',
                    padding: '16px 28px', cursor: 'pointer', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: expanded === req.id ? 'rgba(255,255,255,0.025)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Applicant */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {req.photoURL ? (
                      <img src={req.photoURL} alt={req.name} referrerPolicy="no-referrer"
                        style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(req.name || req.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{req.name || '—'}</div>
                      {req.contactPhone && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{req.contactPhone}</div>}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{req.email}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                    {req.orgName || <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', ...(STATUS_STYLE[req.status] || STATUS_STYLE.pending) }}>
                      {req.status || 'pending'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    {req.status === 'pending' && (
                      <>
                        <button onClick={() => approve(req)} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.35)' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => setConfirm({ type: 'reject', req })} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)' }}>
                          ✕ Reject
                        </button>
                      </>
                    )}
                    {req.status === 'approved' && (
                      <button onClick={() => setConfirm({ type: 'reject', req })} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)' }}>
                        Revoke
                      </button>
                    )}
                    {req.status === 'rejected' && (
                      <button onClick={() => approve(req)} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.3)' }}>
                        Re-approve
                      </button>
                    )}
                    {/* Delete always visible */}
                    <button onClick={() => setConfirm({ type: 'delete', req })} style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(127,29,29,0.4)', color: '#fca5a5', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)' }} title="Delete permanently">
                      🗑
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded === req.id && (
                  <div style={{ padding: '24px 28px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.018)' }}>

                    {/* Org details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '20px' }}>
                      {[
                        { label: 'Org type',       val: req.orgType       },
                        { label: 'Reg number',     val: req.regNumber     },
                        { label: 'Year est.',      val: req.yearEstablished },
                        { label: 'Location',       val: req.city && req.state ? `${req.city}, ${req.state}` : req.city || req.state },
                        { label: 'Contact person', val: req.contactName   },
                        { label: 'Phone',          val: req.contactPhone  },
                        { label: 'Website',        val: req.website       },
                        { label: 'Submitted',      val: req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                      ].filter(f => f.val).map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{f.label}</div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>
                            {f.label === 'Website'
                              ? <a href={f.val} target="_blank" rel="noreferrer" style={{ color: '#67e8f9', textDecoration: 'none' }}>{f.val}</a>
                              : f.val}
                          </div>
                        </div>
                      ))}
                    </div>

                    {req.description && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Mission / Description</div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {req.description}
                        </div>
                      </div>
                    )}

                    {/* Documents */}
                    {req.documents && Object.keys(req.documents).some(k => req.documents[k]) ? (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Uploaded Documents</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {Object.entries(req.documents).map(([key, url]) => {
                            if (!url) return null;
                            return (
                              <a key={key} href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.1)', color: '#c4b5fd', fontSize: '12px', fontWeight: 600 }}>
                                <span style={{ fontSize: '14px' }}>📄</span>
                                {DOC_LABELS[key] || key}
                                <span style={{ fontSize: '10px', opacity: 0.6 }}>↗</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginBottom: '16px' }}>No documents uploaded with this request.</div>
                    )}

                    {/* Danger zone */}
                    <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#fca5a5', marginBottom: '3px' }}>Danger Zone</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                          Permanently delete this organisation record and revoke all their access.
                        </div>
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
        )}
      </div>
    </div>
  );
}