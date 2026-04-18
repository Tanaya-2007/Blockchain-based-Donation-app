import { useEffect, useState } from 'react';
import {
  collection, doc, getDocs,
  orderBy, query, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_STYLE = {
  pending:  { background: 'rgba(245,158,11,0.15)',  color: '#fcd34d',  border: '1px solid rgba(245,158,11,0.35)'  },
  approved: { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7',  border: '1px solid rgba(16,185,129,0.35)'  },
  rejected: { background: 'rgba(239,68,68,0.15)',   color: '#fca5a5',  border: '1px solid rgba(239,68,68,0.35)'   },
};

export default function AdminPanel() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null); // request id being expanded

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch ALL requests — no status filter (that was the bug)
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
      // 1. Update request status
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'approved' });
      // 2. Update user's role in Firestore so they get NGO access on next sign-in
      await updateDoc(doc(db, 'users', req.uid), { role: 'ngo' });
      setRequests(prev =>
        prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r)
      );
    } catch (e) { alert('Failed to approve: ' + e.message); }
  };

  const reject = async (req) => {
    if (!window.confirm(`Reject request from ${req.name || req.email}?`)) return;
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'rejected' });
      setRequests(prev =>
        prev.map(r => r.id === req.id ? { ...r, status: 'rejected' } : r)
      );
    } catch (e) { alert('Failed to reject: ' + e.message); }
  };

  const pending = requests.filter(r => r.status === 'pending').length;

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1000px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#f59e0b', marginBottom: '8px' }}>
        Admin
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '30px', fontWeight: 800, color: '#fff',
        letterSpacing: '-0.5px', marginBottom: '6px',
      }}>Admin panel</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '36px' }}>
        Review and approve organisation registration requests.
      </p>

      {/* NGO Requests card */}
      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{
          padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>
              NGO Requests
            </div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Pending: </span>
              <span style={{ color: pending > 0 ? '#fcd34d' : 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                {pending}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '12px' }}>Total: </span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{requests.length}</span>
            </div>
          </div>
          <button
            onClick={fetchRequests}
            style={{
              padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff', fontWeight: 600, fontSize: '13px',
            }}
          >Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
            Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
            No NGO requests yet.
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr 1fr 0.8fr 1fr',
              padding: '12px 28px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {['Name', 'Email', 'Organisation', 'Status', 'Actions'].map(h => (
                <div key={h} style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {requests.map(req => (
              <div key={req.id}>
                {/* Main row */}
                <div
                  onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.2fr 1fr 0.8fr 1fr',
                    padding: '16px 28px', cursor: 'pointer', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: expanded === req.id ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Name + avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {req.photoURL ? (
                      <img
                        src={req.photoURL} alt={req.name}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: '#7c3aed', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff',
                      }}>{(req.name || req.email || '?')[0].toUpperCase()}</div>
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                      {req.name || '—'}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                    {req.email}
                  </div>

                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    {req.orgName || <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </div>

                  <div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                      borderRadius: '999px',
                      ...(STATUS_STYLE[req.status] || STATUS_STYLE.pending),
                    }}>
                      {req.status || 'pending'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); approve(req); }}
                          style={{
                            padding: '6px 14px', borderRadius: '8px', border: 'none',
                            background: 'rgba(16,185,129,0.2)', color: '#6ee7b7',
                            fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                            border: '1px solid rgba(16,185,129,0.35)',
                          }}
                        >Approve</button>
                        <button
                          onClick={e => { e.stopPropagation(); reject(req); }}
                          style={{
                            padding: '6px 14px', borderRadius: '8px',
                            background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                            fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                            border: '1px solid rgba(239,68,68,0.3)',
                          }}
                        >Reject</button>
                      </>
                    )}
                    {req.status !== 'pending' && (
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>—</span>
                    )}
                  </div>
                </div>

                {/* Expanded org details */}
                {expanded === req.id && (
                  <div style={{
                    padding: '20px 28px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                      gap: '16px', marginBottom: '16px',
                    }}>
                      {[
                        { label: 'Org type',      val: req.orgType        },
                        { label: 'Reg number',     val: req.regNumber      },
                        { label: 'Year est.',      val: req.yearEstablished },
                        { label: 'City',           val: req.city           },
                        { label: 'State',          val: req.state          },
                        { label: 'Contact person', val: req.contactName    },
                        { label: 'Contact phone',  val: req.contactPhone   },
                        { label: 'Website',        val: req.website        },
                      ].filter(f => f.val).map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>{f.val}</div>
                        </div>
                      ))}
                    </div>
                    {req.description && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Mission / Description
                        </div>
                        <div style={{
                          fontSize: '13px', color: 'rgba(255,255,255,0.6)',
                          lineHeight: 1.7, padding: '12px 14px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>{req.description}</div>
                      </div>
                    )}
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