import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc, collection, doc, getDocs,
  limit, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const ORG_TYPES = [
  'Medical / Healthcare',
  'Education',
  'Disaster Relief',
  'Environmental',
  'Child Welfare',
  'Women Empowerment',
  'Animal Welfare',
  'Other NGO',
];

const INPUT = {
  width: '100%', padding: '11px 14px', borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box',
};
const LABEL = {
  fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
  letterSpacing: '0.5px', marginBottom: '6px', display: 'block',
};

export default function NgoDashboard() {
  const { user, role } = useAuth();

  const [status,    setStatus]    = useState('loading'); // loading|none|pending|approved|rejected
  const [requestId, setRequestId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  // Form state
  const [form, setForm] = useState({
    orgName: '', orgType: '', regNumber: '', yearEstablished: '',
    city: '', state: '', website: '',
    description: '', contactName: '', contactPhone: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* ── Check if they already have a request ── */
  useEffect(() => {
    if (!user) return;

    // If Firestore already says ngo/admin → approved
    if (role === 'ngo' || role === 'admin') {
      setStatus('approved'); return;
    }

    // Otherwise check ngoRequests collection
    (async () => {
      const q = query(
        collection(db, 'ngoRequests'),
        where('uid', '==', user.uid),
        limit(5),
      );
      const snap = await getDocs(q);
      if (snap.empty) { setStatus('none'); return; }

      // Take the most recent request
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      const latest = docs[0];
      setRequestId(latest.id);
      setStatus(latest.status || 'pending'); // pending | approved | rejected
    })();
  }, [user, role]);

  /* ── Submit registration ── */
  const handleSubmit = async () => {
    if (!form.orgName || !form.orgType || !form.regNumber || !form.city || !form.state || !form.description || !form.contactName || !form.contactPhone) {
      alert('Please fill all required fields (*).');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'ngoRequests'), {
        uid:         user.uid,
        email:       user.email        || '',
        name:        user.displayName  || '',
        photoURL:    user.photoURL     || '',
        status:      'pending',
        ...form,
        createdAt:   serverTimestamp(),
      });
      setSubmitted(true);
      setStatus('pending');
    } catch (e) {
      alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading ── */
  if (status === 'loading') {
    return (
      <div style={{ padding: '80px 48px', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
        Loading…
      </div>
    );
  }

  /* ── APPROVED — full NGO dashboard ── */
  if (status === 'approved') {
    return (
      <div style={{ padding: '40px 48px', maxWidth: '900px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#10b981', marginBottom: '8px' }}>
          NGO Dashboard
        </div>
        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '30px', fontWeight: 800, color: '#fff',
          letterSpacing: '-0.5px', marginBottom: '6px',
        }}>Welcome, {user?.displayName?.split(' ')[0] || 'Organisation'}</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '36px' }}>
          Manage your campaigns, upload milestone proofs, and track fund releases.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Active campaigns', val: '0',  color: '#a78bfa' },
            { label: 'Total raised',     val: '₹0', color: '#22d3ee' },
            { label: 'Funds released',   val: '₹0', color: '#34d399' },
          ].map(s => (
            <div key={s.label} style={{
              borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
              background: '#0d1021', padding: '20px', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '28px', fontWeight: 800, color: s.color, marginBottom: '4px',
              }}>{s.val}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/proof" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '12px',
            background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
            color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
          }}>
            📄 Upload Milestone Proof
          </Link>
          <Link to="/campaigns" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '12px 24px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
          }}>
            Browse Campaigns
          </Link>
        </div>
      </div>
    );
  }

  /* ── PENDING ── */
  if (status === 'pending') {
    return (
      <div style={{ padding: '80px 48px', maxWidth: '560px' }}>
        <div style={{
          padding: '32px', borderRadius: '20px',
          border: '1px solid rgba(245,158,11,0.35)',
          background: 'rgba(245,158,11,0.06)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '10px',
          }}>Application under review</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
            Your organisation registration request has been submitted. An admin will review your details
            and approve or reject your application. You'll be able to access the NGO dashboard once approved.
          </p>
          <div style={{
            padding: '12px 16px', borderRadius: '10px',
            border: '1px solid rgba(245,158,11,0.3)',
            background: 'rgba(245,158,11,0.1)',
            fontSize: '13px', color: '#fcd34d',
          }}>
            💡 After approval, sign out and sign back in to access the full NGO dashboard.
          </div>
          <Link to="/" style={{
            display: 'inline-block', marginTop: '20px',
            padding: '10px 24px', borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff', fontWeight: 600, fontSize: '13px', textDecoration: 'none',
          }}>Back to home</Link>
        </div>
      </div>
    );
  }

  /* ── REJECTED ── */
  if (status === 'rejected') {
    return (
      <div style={{ padding: '80px 48px', maxWidth: '560px' }}>
        <div style={{
          padding: '32px', borderRadius: '20px',
          border: '1px solid rgba(239,68,68,0.35)',
          background: 'rgba(239,68,68,0.06)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '10px',
          }}>Application rejected</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
            Your organisation application was not approved. You can reapply with corrected information.
          </p>
          <button onClick={() => setStatus('none')} style={{
            padding: '12px 24px', borderRadius: '10px', border: 'none',
            background: '#7c3aed', color: '#fff', fontWeight: 700,
            fontSize: '14px', cursor: 'pointer',
          }}>Reapply</button>
        </div>
      </div>
    );
  }

  /* ── REGISTRATION FORM (status === 'none') ── */
  return (
    <div style={{ padding: '40px 48px', maxWidth: '760px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#22d3ee', marginBottom: '8px' }}>
        Organisation Registration
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '30px', fontWeight: 800, color: '#fff',
        letterSpacing: '-0.5px', marginBottom: '6px',
      }}>Register your organisation</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '36px' }}>
        Fill in the details below. An admin will review and approve your application before you can create campaigns.
      </p>

      <div style={{
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1021', padding: '32px',
      }}>

        {/* ── Row 1: org name + type ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={LABEL}>Organisation name *</label>
            <input
              value={form.orgName}
              onChange={e => set('orgName', e.target.value)}
              placeholder="e.g. Helping Hands Foundation"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Organisation type *</label>
            <select
              value={form.orgType}
              onChange={e => set('orgType', e.target.value)}
              style={{ ...INPUT, appearance: 'none' }}
            >
              <option value="">Select type…</option>
              {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* ── Row 2: reg number + year ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={LABEL}>Registration / Certificate number *</label>
            <input
              value={form.regNumber}
              onChange={e => set('regNumber', e.target.value)}
              placeholder="e.g. MH/12345/2018"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Year established</label>
            <input
              type="number" min="1900" max={new Date().getFullYear()}
              value={form.yearEstablished}
              onChange={e => set('yearEstablished', e.target.value)}
              placeholder="e.g. 2015"
              style={INPUT}
            />
          </div>
        </div>

        {/* ── Row 3: city + state ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={LABEL}>City *</label>
            <input
              value={form.city}
              onChange={e => set('city', e.target.value)}
              placeholder="e.g. Pune"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>State *</label>
            <input
              value={form.state}
              onChange={e => set('state', e.target.value)}
              placeholder="e.g. Maharashtra"
              style={INPUT}
            />
          </div>
        </div>

        {/* ── Website ── */}
        <div style={{ marginBottom: '16px' }}>
          <label style={LABEL}>Website (optional)</label>
          <input
            type="url"
            value={form.website}
            onChange={e => set('website', e.target.value)}
            placeholder="https://yourorg.org"
            style={INPUT}
          />
        </div>

        {/* ── Description ── */}
        <div style={{ marginBottom: '16px' }}>
          <label style={LABEL}>Mission & description *</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Describe your organisation's mission, the work you do, and why you need to raise funds on TransparentFund…"
            style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        {/* ── Contact person ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
          <div>
            <label style={LABEL}>Contact person name *</label>
            <input
              value={form.contactName}
              onChange={e => set('contactName', e.target.value)}
              placeholder="e.g. Priya Sharma"
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Contact phone *</label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={e => set('contactPhone', e.target.value)}
              placeholder="e.g. 9876543210"
              style={INPUT}
            />
          </div>
        </div>

        {/* ── Notice ── */}
        <div style={{
          padding: '14px 16px', borderRadius: '10px', marginBottom: '24px',
          border: '1px solid rgba(34,211,238,0.25)',
          background: 'rgba(34,211,238,0.06)',
          fontSize: '13px', color: '#67e8f9', lineHeight: 1.65,
        }}>
          📋 After submission, an admin will review your registration. Approval typically takes 1-2 business days.
          You will be notified via email once your organisation is approved.
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
            background: submitting ? 'rgba(34,211,238,0.3)' : 'linear-gradient(135deg,#0891b2,#7c3aed)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {submitting ? (
            <>
              <span style={{
                width: '16px', height: '16px',
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Submitting…
            </>
          ) : 'Submit Registration for Admin Review'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}