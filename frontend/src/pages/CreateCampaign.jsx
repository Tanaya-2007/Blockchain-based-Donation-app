import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const CATEGORIES = [
  'Medical / Healthcare', 'Education', 'Disaster Relief',
  'Environmental', 'Child Welfare', 'Women Empowerment',
  'Animal Welfare', 'Community Development', 'Other',
];

function uploadImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', 'campaignBanners');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText);
        if (xhr.status === 200) resolve(r.secure_url);
        else reject(new Error(r.error?.message || 'Upload failed'));
      } catch { reject(new Error('Invalid Cloudinary response')); }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

const INPUT = {
  width: '100%', padding: '11px 14px', borderRadius: '10px',
  background: '#111827', color: '#fff', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
  border: '1px solid rgba(255,255,255,0.12)', transition: 'border-color 0.2s',
};
const ERR_INPUT = { ...INPUT, border: '1px solid rgba(239,68,68,0.7)' };
const LABEL = { fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.4px', marginBottom: '6px', display: 'block' };
const ERR   = { fontSize: '11px', color: '#f87171', marginTop: '4px' };
const SEC   = { fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };

function Field({ label, required, error, touched, hint, children }) {
  return (
    <div>
      <label style={LABEL}>{label}{required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}</label>
      {hint && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>{hint}</div>}
      {children}
      {error && touched && <div style={ERR}>⚠ {error}</div>}
    </div>
  );
}

const VALIDATORS = {
  title:        v => !v.trim() ? 'Title is required' : v.trim().length < 5 ? 'At least 5 characters' : null,
  description:  v => !v.trim() ? 'Description is required' : v.trim().length < 50 ? 'At least 50 characters required' : null,
  targetAmount: v => { const n = Number(v); return (!v || isNaN(n) || n < 1000) ? 'Minimum target is ₹1,000' : null; },
  category:     v => !v ? 'Please select a category' : null,
  milestones:   v => { const n = Number(v); return (!v || isNaN(n) || n < 1 || n > 10) ? 'Enter 1–10 milestones' : null; },
  deadline:     v => {
    if (!v) return 'Deadline is required';
    const d = new Date(v);
    if (isNaN(d)) return 'Invalid date';
    if (d <= new Date()) return 'Deadline must be in the future';
    return null;
  },
};

/* ── CRITICAL: compute milestone amounts as integers ──
   Always use Math.floor and Number() to avoid NaN or strings
   which would save as 0 in Firestore.                     */
function buildMilestones(targetAmount, count) {
  const total = Math.floor(Number(targetAmount));  // ensure integer
  const n     = Math.floor(Number(count));
  if (!total || !n || n < 1) return [];
  const perMs = Math.floor(total / n);             // integer division
  return Array.from({ length: n }, (_, i) => ({
    no:     i + 1,
    title:  `Milestone ${i + 1}`,
    // Last milestone gets remainder so total is exact
    amount: i === n - 1 ? total - perMs * (n - 1) : perMs,
    status: i === 0 ? 'pending' : 'locked',
  }));
}

export default function CreateCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '', description: '', targetAmount: '',
    category: '', milestones: '3', deadline: '',
  });
  const [touched,   setTouched]   = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imageErr,  setImageErr]  = useState('');
  const [preview,   setPreview]   = useState('');

  const [saving,      setSaving]      = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [uploadPhase, setUploadPhase] = useState('');

  const imgRef = useRef();

  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const getErr   = k => VALIDATORS[k]?.(form[k]) ?? null;

  const handleImage = file => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageErr('Only images allowed'); return; }
    if (file.size > 5 * 1024 * 1024)    { setImageErr('Max 5 MB'); return; }
    setImageErr('');
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    const allKeys = Object.keys(VALIDATORS);
    setTouched(allKeys.reduce((a, k) => ({ ...a, [k]: true }), {}));
    if (allKeys.some(k => VALIDATORS[k](form[k]))) return;

    setSaving(true);
    try {
      let imageUrl = '';
      if (imageFile) {
        setUploadPhase('Uploading campaign image…');
        imageUrl = await uploadImage(imageFile, pct => setUploadPct(pct));
      }

      setUploadPhase('Saving campaign…');

      // ── Build milestones with correct integer amounts ──
      const milestoneList = buildMilestones(form.targetAmount, form.milestones);

      await addDoc(collection(db, 'campaigns'), {
        title:            form.title.trim(),
        description:      form.description.trim(),
        targetAmount:     Number(form.targetAmount),   // always Number
        raisedAmount:     0,
        donorCount:       0,
        category:         form.category,
        imageUrl,
        milestones:       milestoneList,
        currentMilestone: 1,
        deadline:         new Date(form.deadline),
        status:           'active',
        ngoId:            user.uid,
        ngoName:          user.displayName || '',
        ngoEmail:         user.email || '',
        createdAt:        serverTimestamp(),
      });

      navigate('/ngo');
    } catch (e) {
      alert('Failed to create campaign: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Preview milestone breakdown
  const milestonePreview = !getErr('targetAmount') && !getErr('milestones')
    ? buildMilestones(form.targetAmount, form.milestones)
    : [];

  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{ minHeight: 'calc(100vh - 68px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 16px 80px' }}>
      <div style={{ width: '100%', maxWidth: '720px' }}>

        <button onClick={() => navigate('/ngo')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '13px', cursor: 'pointer', marginBottom: '28px', padding: 0 }}>
          ← Back to Dashboard
        </button>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#22d3ee', marginBottom: '8px' }}>Campaign Creation</div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>Create a new campaign</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.6 }}>
          Set your fundraising goal, define milestones, and start receiving verified donations.
        </p>

        <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '32px' }}>

          <div style={SEC}>Campaign details</div>

          <div style={{ marginBottom: '16px' }}>
            <Field label="Campaign title" required error={getErr('title')} touched={touched.title}>
              <input value={form.title} onChange={e => setField('title', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, title: true }))}
                placeholder="e.g. Help Ravi Kumar's Kidney Surgery"
                style={getErr('title') && touched.title ? ERR_INPUT : INPUT} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Field label="Category" required error={getErr('category')} touched={touched.category}>
              <select value={form.category} onChange={e => setField('category', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, category: true }))}
                style={{ ...(getErr('category') && touched.category ? ERR_INPUT : INPUT), WebkitAppearance: 'none', cursor: 'pointer' }}>
                <option value="">Select category…</option>
                {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#111827' }}>{c}</option>)}
              </select>
            </Field>
            <Field label="Target amount (₹)" required error={getErr('targetAmount')} touched={touched.targetAmount}>
              <input type="number" min="1000" value={form.targetAmount}
                onChange={e => setField('targetAmount', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, targetAmount: true }))}
                placeholder="e.g. 300000"
                style={getErr('targetAmount') && touched.targetAmount ? ERR_INPUT : INPUT} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Field label="Number of milestones" required error={getErr('milestones')} touched={touched.milestones}
              hint="Funds release one milestone at a time after AI verification">
              <input type="number" min="1" max="10" value={form.milestones}
                onChange={e => setField('milestones', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, milestones: true }))}
                placeholder="e.g. 3"
                style={getErr('milestones') && touched.milestones ? ERR_INPUT : INPUT} />
            </Field>
            <Field label="Campaign deadline" required error={getErr('deadline')} touched={touched.deadline}>
              <input type="date" min={today} value={form.deadline}
                onChange={e => setField('deadline', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, deadline: true }))}
                style={{ ...(getErr('deadline') && touched.deadline ? ERR_INPUT : INPUT), colorScheme: 'dark' }} />
            </Field>
          </div>

          {/* Live milestone breakdown preview */}
          {milestonePreview.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.05)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#67e8f9', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Milestone breakdown (amounts are correct integers)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {milestonePreview.map((m, i) => (
                  <div key={i} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', fontSize: '12px', color: '#67e8f9' }}>
                    M{i + 1}: ₹{m.amount.toLocaleString('en-IN')}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>
                Total: ₹{milestonePreview.reduce((s, m) => s + m.amount, 0).toLocaleString('en-IN')}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '28px' }}>
            <Field label="Description" required error={getErr('description')} touched={touched.description}
              hint={`${form.description.trim().length}/50 characters minimum`}>
              <textarea rows={5} value={form.description}
                onChange={e => setField('description', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, description: true }))}
                placeholder="Describe your campaign in detail — the beneficiary, the need, how funds will be used…"
                style={{ ...(getErr('description') && touched.description ? ERR_INPUT : INPUT), resize: 'vertical', lineHeight: 1.65 }} />
            </Field>
          </div>

          <div style={SEC}>Campaign image</div>

          <div style={{ marginBottom: '28px' }}>
            <label style={LABEL}>Banner image <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px' }}>(optional)</span></label>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginBottom: '8px' }}>Shown on the campaigns page. JPG, PNG — max 5 MB.</div>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImage(e.target.files[0])} />

            {preview ? (
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                <img src={preview} alt="preview" style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => { setImageFile(null); setPreview(''); }}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>
                  Remove
                </button>
              </div>
            ) : (
              <div onClick={() => imgRef.current.click()} style={{
                border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '12px',
                padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s',
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖼</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Click to upload banner image</div>
              </div>
            )}
            {imageErr && <div style={ERR}>⚠ {imageErr}</div>}
          </div>

          {saving && (
            <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.08)' }}>
              <div style={{ fontSize: '13px', color: '#c4b5fd', marginBottom: '8px' }}>{uploadPhase}</div>
              {uploadPct > 0 && uploadPct < 100 && (
                <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadPct}%`, borderRadius: '6px', background: 'linear-gradient(90deg,#7c3aed,#0891b2)', transition: 'width 0.2s' }} />
                </div>
              )}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving} style={{
            width: '100%', padding: '15px', borderRadius: '12px', border: 'none',
            background: saving ? 'rgba(8,145,178,0.4)' : 'linear-gradient(135deg,#0891b2,#7c3aed)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            {saving ? (
              <>
                <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                {uploadPhase || 'Creating campaign…'}
              </>
            ) : '🚀 Launch Campaign'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}