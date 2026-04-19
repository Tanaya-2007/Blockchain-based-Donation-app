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

/* ─── smart milestone suggestion ────────────────────── */
function suggestMilestones(targetAmount) {
  const n = Number(targetAmount);
  if (!n || isNaN(n)) return 3;
  if (n < 50000)  return 2;
  if (n < 200000) return 3;
  if (n < 1000000) return 4;
  return 5;
}

const MILESTONE_INFO = {
  2: { label: '2 milestones', desc: 'Best for urgent or short campaigns under ₹50,000', color: '#22d3ee' },
  3: { label: '3 milestones', desc: 'Ideal general-purpose split — balanced accountability', color: '#10b981', recommended: true },
  4: { label: '4 milestones', desc: 'Suited for mid-size campaigns with defined phases', color: '#a78bfa' },
  5: { label: '5 milestones', desc: 'Large long-term projects with multiple tracked stages', color: '#f59e0b' },
};

/* ─── upload to Cloudinary ───────────────────────────── */
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

/* ─── styles ─────────────────────────────────────────── */
const BASE_INPUT = {
  width: '100%', padding: '11px 14px', borderRadius: '10px',
  background: '#111827', color: '#fff', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};
const INPUT     = { ...BASE_INPUT, border: '1px solid rgba(255,255,255,0.12)' };
const ERR_INPUT = { ...BASE_INPUT, border: '1px solid rgba(239,68,68,0.7)' };
const LABEL     = { fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.4px', marginBottom: '6px', display: 'block' };
const ERR_TEXT  = { fontSize: '11px', color: '#f87171', marginTop: '4px' };
const SEC       = { fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' };

function Field({ label, required, error, touched, hint, children }) {
  return (
    <div>
      <label style={LABEL}>
        {label}
        {required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>{hint}</div>}
      {children}
      {error && touched && <div style={ERR_TEXT}>⚠ {error}</div>}
    </div>
  );
}

const VALIDATORS = {
  title:        v => !v.trim() ? 'Title is required' : v.trim().length < 5 ? 'At least 5 characters' : null,
  description:  v => !v.trim() ? 'Description is required' : v.trim().length < 50 ? 'At least 50 characters required' : null,
  targetAmount: v => { const n = Number(v); return (!v || isNaN(n) || n < 1000) ? 'Minimum target is ₹1,000' : null; },
  category:     v => !v ? 'Please select a category' : null,
  milestones:   v => {
    const n = Number(v);
    if (!v || isNaN(n)) return 'Please select milestone count';
    if (n < 2) return 'Minimum 2 milestones required — single-milestone campaigns are not allowed to prevent fraud';
    if (n > 5) return 'Maximum 5 milestones — keeps admin review manageable';
    return null;
  },
  deadline: v => {
    if (!v) return 'Deadline is required';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'Invalid date';
    // Allow today and future — emergencies may need same-day start
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) return 'Deadline cannot be in the past';
    return null;
  },
};

export default function CreateCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '', description: '', targetAmount: '',
    category: '', milestones: '', deadline: '',
  });
  const [touched,   setTouched]   = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imageErr,  setImageErr]  = useState('');
  const [preview,   setPreview]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadPhase, setUploadPhase] = useState('');

  const imgRef = useRef();

  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const getErr   = k => VALIDATORS[k]?.(form[k]) ?? null;

  // Derive smart suggestion from current target amount
  const suggestion = suggestMilestones(form.targetAmount);

  // Per-milestone amount preview
  const milestoneAmounts = (() => {
    const n = Number(form.milestones);
    const t = Number(form.targetAmount);
    if (!n || !t || isNaN(n) || isNaN(t) || getErr('milestones') || getErr('targetAmount')) return [];
    const per = Math.floor(t / n);
    return Array.from({ length: n }, (_, i) => ({
      no: i + 1,
      amount: i === n - 1 ? t - per * (n - 1) : per,
    }));
  })();

  // Warn if milestone count seems excessive for the amount
  const milestoneWarning = (() => {
    const n = Number(form.milestones);
    const t = Number(form.targetAmount);
    if (!n || !t || isNaN(n) || isNaN(t)) return null;
    const per = Math.floor(t / n);
    if (per < 5000) return `Each milestone would be only ₹${per.toLocaleString('en-IN')} — consider fewer milestones for this amount.`;
    return null;
  })();

  const handleImage = file => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageErr('Only images allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageErr('Max 5 MB'); return; }
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
      const count = Number(form.milestones);
      const total = Number(form.targetAmount);
      const per   = Math.floor(total / count);

      const milestoneList = Array.from({ length: count }, (_, i) => ({
        no:     i + 1,
        title:  `Milestone ${i + 1}`,
        amount: i === count - 1 ? total - per * (count - 1) : per,
        status: i === 0 ? 'pending' : 'locked',
      }));

      await addDoc(collection(db, 'campaigns'), {
        title:            form.title.trim(),
        description:      form.description.trim(),
        targetAmount:     total,
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

  // Allow today as earliest deadline (emergency campaigns)
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{ minHeight: 'calc(100vh - 68px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 16px 80px' }}>
      <div style={{ width: '100%', maxWidth: '720px' }}>

        <button onClick={() => navigate('/ngo')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '13px', cursor: 'pointer', marginBottom: '28px', padding: 0 }}>
          ← Back to Dashboard
        </button>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#22d3ee', marginBottom: '8px' }}>
          Campaign Creation
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>
          Create a new campaign
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.6 }}>
          Set your fundraising goal, define milestones, and start receiving verified donations.
        </p>

        <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '32px' }}>

          {/* ── Campaign details ── */}
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

          {/* ── Milestone selector ── */}
          <div style={{ marginBottom: '16px' }}>
            <label style={LABEL}>
              Number of milestones <span style={{ color: '#f87171' }}>*</span>
            </label>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginBottom: '10px' }}>
              Funds are released one milestone at a time after AI verification. Minimum 2, maximum 5.
            </div>

            {/* Smart suggestion banner */}
            {form.targetAmount && !getErr('targetAmount') && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
                border: '1px solid rgba(34,211,238,0.25)', background: 'rgba(34,211,238,0.06)',
                fontSize: '12px', color: '#67e8f9',
              }}>
                💡 For ₹{Number(form.targetAmount).toLocaleString('en-IN')}, we suggest <strong>{suggestion} milestones</strong>
              </div>
            )}

            {/* Milestone radio cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {[2, 3, 4, 5].map(n => {
                const info     = MILESTONE_INFO[n];
                const isActive = form.milestones === String(n);
                const isSugg   = suggestion === n && !getErr('targetAmount') && form.targetAmount;
                return (
                  <button key={n}
                    onClick={() => setField('milestones', String(n))}
                    style={{
                      padding: '14px 10px', borderRadius: '12px', cursor: 'pointer',
                      border: isActive
                        ? `1.5px solid ${info.color}`
                        : isSugg
                        ? '1.5px solid rgba(255,255,255,0.2)'
                        : '1px solid rgba(255,255,255,0.08)',
                      background: isActive ? `${info.color}18` : isSugg ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                      transition: 'all 0.18s', outline: 'none', textAlign: 'center',
                    }}>
                    {/* Number badge */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', margin: '0 auto 8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, fontFamily: "'Playfair Display', Georgia, serif",
                      background: isActive ? `${info.color}30` : 'rgba(255,255,255,0.06)',
                      color: isActive ? info.color : 'rgba(255,255,255,0.5)',
                      border: isActive ? `1px solid ${info.color}50` : '1px solid rgba(255,255,255,0.1)',
                    }}>{n}</div>

                    <div style={{ fontSize: '11px', fontWeight: 700, color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                      {n} milestone{n > 1 ? 's' : ''}
                    </div>

                    {/* Recommended tag */}
                    {isSugg && (
                      <div style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px', display: 'inline-block', background: `${info.color}25`, color: info.color, border: `1px solid ${info.color}40`, marginBottom: '4px' }}>
                        suggested
                      </div>
                    )}

                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.4 }}>
                      {info.desc.split('—')[0]}
                    </div>
                  </button>
                );
              })}
            </div>
            {getErr('milestones') && touched.milestones && (
              <div style={ERR_TEXT}>⚠ {getErr('milestones')}</div>
            )}
          </div>

          {/* Why 1 is blocked — educational note */}
          <div style={{
            padding: '12px 14px', borderRadius: '10px', marginBottom: '16px',
            border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)',
            fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6,
          }}>
            🛡️ <strong style={{ color: '#fca5a5' }}>1 milestone not allowed.</strong> Single-milestone campaigns allow full fund release with just one proof upload — a known fraud vector. Minimum 2 ensures staged accountability.
          </div>

          {/* Deadline */}
          <div style={{ marginBottom: '16px' }}>
            <Field label="Campaign deadline" required error={getErr('deadline')} touched={touched.deadline}
              hint="Emergency campaigns can end today or this week — any future or current date is allowed">
              <input type="date"
                min={todayStr}
                value={form.deadline}
                onChange={e => setField('deadline', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, deadline: true }))}
                style={{ ...(getErr('deadline') && touched.deadline ? ERR_INPUT : INPUT), colorScheme: 'dark' }} />
            </Field>
          </div>

          {/* Milestone breakdown preview */}
          {milestoneAmounts.length > 0 && (
            <div style={{
              padding: '16px 18px', borderRadius: '14px', marginBottom: '16px',
              border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.04)',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#67e8f9', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                Milestone breakdown
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: milestoneWarning ? '12px' : 0 }}>
                {milestoneAmounts.map(m => (
                  <div key={m.no} style={{
                    padding: '8px 14px', borderRadius: '10px',
                    background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
                    fontSize: '13px', fontWeight: 600, color: '#67e8f9',
                  }}>
                    <span style={{ opacity: 0.6, fontSize: '11px' }}>M{m.no}  </span>
                    ₹{m.amount.toLocaleString('en-IN')}
                  </div>
                ))}
              </div>
              {milestoneWarning && (
                <div style={{ fontSize: '12px', color: '#fcd34d', marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  ⚠ {milestoneWarning}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '10px', lineHeight: 1.6 }}>
                Each milestone releases only after the NGO uploads proof and AI verification passes. Funds are locked until then.
              </div>
            </div>
          )}

          <div style={{ marginBottom: '28px' }}>
            <Field label="Description" required error={getErr('description')} touched={touched.description}
              hint={`${form.description.trim().length}/50 characters minimum — explain the need, beneficiary, and how funds will be used`}>
              <textarea rows={5} value={form.description}
                onChange={e => setField('description', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, description: true }))}
                placeholder="Describe your campaign in detail — the beneficiary, the urgent need, and exactly how each milestone's funds will be used…"
                style={{ ...(getErr('description') && touched.description ? ERR_INPUT : INPUT), resize: 'vertical', lineHeight: 1.65 }} />
            </Field>
          </div>

          {/* ── Campaign image ── */}
          <div style={SEC}>Campaign image (optional)</div>
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginBottom: '10px' }}>
              Shown on the campaigns page. JPG, PNG — max 5 MB. If skipped, a category icon is shown instead.
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleImage(e.target.files[0])} />

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
            {imageErr && <div style={ERR_TEXT}>⚠ {imageErr}</div>}
          </div>

          {/* Upload progress */}
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