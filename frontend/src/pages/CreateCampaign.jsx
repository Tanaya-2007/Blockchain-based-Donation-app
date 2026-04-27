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

/* ─── Auto-assign milestones based on target amount ─────
   No user input needed — removes one friction point and
   prevents manipulation (e.g. gaming a single milestone) */
function autoMilestones(targetAmount) {
  const n = Number(targetAmount);
  if (!n || isNaN(n)) return 3;
  if (n < 50000)   return 2;   // < ₹50K  → 2 milestones
  if (n < 200000)  return 3;   // < ₹2L   → 3 milestones
  if (n < 1000000) return 4;   // < ₹10L  → 4 milestones
  return 5;                     // ₹10L+   → 5 milestones
}

const MILESTONE_REASON = {
  2: 'Urgent / small campaign — 2 milestones ensures basic accountability',
  3: 'Standard split — balanced accountability for mid-size campaigns',
  4: 'Multi-phase project — 4 checkpoints for larger campaigns',
  5: 'Large long-term campaign — 5 stages with maximum accountability',
};

function buildMilestones(targetAmount, count) {
  const total = Math.floor(Number(targetAmount));
  const n     = Number(count);
  if (!total || !n) return [];
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    no:     i + 1,
    title:  `Milestone ${i + 1}`,
    amount: i === n - 1 ? total - per * (n - 1) : per,
    status: i === 0 ? 'pending' : 'locked',
  }));
}

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

const BASE = {
  width:'100%', padding:'11px 14px', borderRadius:'10px',
  background:'#111827', color:'#fff', fontSize:'14px',
  outline:'none', boxSizing:'border-box',
  border:'1px solid rgba(255,255,255,0.12)', transition:'border-color 0.2s',
};
const ERR_B = { ...BASE, border:'1px solid rgba(239,68,68,0.7)' };
const LABEL = { fontSize:'12px', fontWeight:600, color:'rgba(255,255,255,0.5)', letterSpacing:'0.4px', marginBottom:'6px', display:'block' };
const ERR_T = { fontSize:'11px', color:'#f87171', marginTop:'4px' };
const SEC   = { fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'16px', paddingBottom:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' };

function Field({ label, required, error, touched, hint, children }) {
  return (
    <div>
      <label style={LABEL}>{label}{required && <span style={{ color:'#f87171', marginLeft:4 }}>*</span>}</label>
      {hint && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.28)', marginBottom:6 }}>{hint}</div>}
      {children}
      {error && touched && <div style={ERR_T}>⚠ {error}</div>}
    </div>
  );
}

const VALIDATORS = {
  title:        v => {
    if (!v.trim()) return 'Title is required';
    if (v.trim().length < 5) return 'At least 5 characters';
    if (!/^[a-zA-Z0-9\s.,&'()-]+$/.test(v.trim())) return 'Title contains invalid special characters';
    return null;
  },
  description:  v => {
    if (!v.trim()) return 'Description is required';
    if (v.trim().length < 50) return 'At least 50 characters required';
    if (/(.{5,})\1{4,}/.test(v.trim())) return 'Please write a real description — avoid excessive repetition';
    return null;
  },
  targetAmount: v => { const n = Number(v); return (!v || isNaN(n) || n < 1000) ? 'Minimum target is ₹1,000' : null; },
  category:     v => !v ? 'Please select a category' : null,
  deadline: v => {
    if (!v) return 'Deadline is required';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'Invalid date';
    const today = new Date(); today.setHours(0,0,0,0);
    if (d < today) return 'Deadline cannot be in the past';
    return null;
  },
};

export default function CreateCampaign() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title:'', description:'', targetAmount:'',
    category:'', deadline:'',
  });
  const [touched,     setTouched]     = useState({});
  const [imageFile,   setImageFile]   = useState(null);
  const [imageErr,    setImageErr]    = useState('');
  const [preview,     setPreview]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);
  const [uploadPhase, setUploadPhase] = useState('');
  const imgRef = useRef();

  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const getErr   = k => VALIDATORS[k]?.(form[k]) ?? null;

  // Auto-computed — no user input
  const msCount   = autoMilestones(form.targetAmount);
  const msPreview = !getErr('targetAmount') && form.targetAmount
    ? buildMilestones(form.targetAmount, msCount)
    : [];

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
      const milestoneList = buildMilestones(form.targetAmount, msCount);

      await addDoc(collection(db, 'campaigns'), {
        title:            form.title.trim(),
        description:      form.description.trim(),
        targetAmount:     Number(form.targetAmount),
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

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'48px 16px 80px' }}>
      <div style={{ width:'100%', maxWidth:'720px' }}>

        <button onClick={() => navigate('/ngo')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.35)', fontSize:'13px', cursor:'pointer', marginBottom:'28px', padding:0 }}>
          ← Back to Dashboard
        </button>

        <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#22d3ee', marginBottom:'8px' }}>Campaign Creation</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'28px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>
          Create a new campaign
        </h2>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'32px', lineHeight:1.6 }}>
          Set your fundraising goal, define milestones, and start receiving verified donations.
        </p>

        <div style={{ borderRadius:'20px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'32px' }}>

          <div style={SEC}>Campaign details</div>

          <div style={{ marginBottom:'16px' }}>
            <Field label="Campaign title" required error={getErr('title')} touched={touched.title}>
              <input value={form.title} onChange={e => setField('title', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, title:true }))}
                placeholder="e.g. Help Ravi Kumar's Kidney Surgery"
                style={getErr('title') && touched.title ? ERR_B : BASE} />
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Category" required error={getErr('category')} touched={touched.category}>
              <select value={form.category} onChange={e => setField('category', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, category:true }))}
                style={{ ...(getErr('category') && touched.category ? ERR_B : BASE), WebkitAppearance:'none', cursor:'pointer' }}>
                <option value="">Select category…</option>
                {CATEGORIES.map(c => <option key={c} value={c} style={{ background:'#111827' }}>{c}</option>)}
              </select>
            </Field>
            <Field label="Target amount (₹)" required error={getErr('targetAmount')} touched={touched.targetAmount}>
              <input type="number" min="1000" value={form.targetAmount}
                onChange={e => setField('targetAmount', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, targetAmount:true }))}
                placeholder="e.g. 300000"
                style={getErr('targetAmount') && touched.targetAmount ? ERR_B : BASE} />
            </Field>
          </div>

          {/* Auto-assigned milestones — read only, no input needed */}
          {msPreview.length > 0 && (
            <div style={{ marginBottom:'16px', padding:'18px 20px', borderRadius:'14px', border:'1px solid rgba(34,211,238,0.25)', background:'rgba(34,211,238,0.04)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#67e8f9', letterSpacing:'1px', textTransform:'uppercase' }}>
                  Auto-assigned: {msCount} milestones
                </div>
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)', fontStyle:'italic' }}>
                  Set automatically based on target amount
                </div>
              </div>

              {/* Why this count */}
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)', marginBottom:'12px', lineHeight:1.5 }}>
                💡 {MILESTONE_REASON[msCount]}
              </div>

              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'8px' }}>
                {msPreview.map((m, i) => (
                  <div key={i} style={{ padding:'8px 14px', borderRadius:'10px', background:'rgba(34,211,238,0.1)', border:'1px solid rgba(34,211,238,0.2)', fontSize:'12px', fontWeight:600, color:'#67e8f9' }}>
                    <span style={{ opacity:0.6 }}>M{i+1}  </span>
                    ₹{m.amount.toLocaleString('en-IN')}
                  </div>
                ))}
              </div>

              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)', lineHeight:1.6 }}>
                Each milestone unlocks only after the NGO uploads proof and AI verification passes.
                Minimum 2, maximum 5 milestones allowed — single-milestone campaigns are disabled to prevent fraud.
              </div>
            </div>
          )}

          <div style={{ marginBottom:'16px' }}>
            <Field label="Campaign deadline" required error={getErr('deadline')} touched={touched.deadline}
              hint="Emergency campaigns can end today — any current or future date is allowed">
              <input type="date" min={todayStr} value={form.deadline}
                onChange={e => setField('deadline', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, deadline:true }))}
                style={{ ...(getErr('deadline') && touched.deadline ? ERR_B : BASE), colorScheme:'dark' }} />
            </Field>
          </div>

          <div style={{ marginBottom:'28px' }}>
            <Field label="Description" required error={getErr('description')} touched={touched.description}
              hint={`${form.description.trim().length}/50 characters minimum`}>
              <textarea rows={5} value={form.description}
                onChange={e => setField('description', e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, description:true }))}
                placeholder="Describe your campaign — the beneficiary, the urgent need, and exactly how each milestone's funds will be used…"
                style={{ ...(getErr('description') && touched.description ? ERR_B : BASE), resize:'vertical', lineHeight:1.65 }} />
            </Field>
          </div>

          <div style={SEC}>Campaign image (optional)</div>
          <div style={{ marginBottom:'28px' }}>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.28)', marginBottom:'10px' }}>
              Shown on the campaigns page. JPG, PNG — max 5 MB. If skipped, a category icon is shown.
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleImage(e.target.files[0])} />

            {preview ? (
              <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', marginBottom:'8px' }}>
                <img src={preview} alt="preview" style={{ width:'100%', height:'180px', objectFit:'cover', display:'block' }} />
                <button onClick={() => { setImageFile(null); setPreview(''); }}
                  style={{ position:'absolute', top:'10px', right:'10px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontSize:'12px' }}>
                  Remove
                </button>
              </div>
            ) : (
              <div onClick={() => imgRef.current.click()} style={{
                border:'2px dashed rgba(255,255,255,0.1)', borderRadius:'12px',
                padding:'36px 24px', textAlign:'center', cursor:'pointer',
                background:'rgba(255,255,255,0.02)', transition:'all 0.2s',
              }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>🖼</div>
                <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.4)' }}>Click to upload banner image</div>
              </div>
            )}
            {imageErr && <div style={ERR_T}>⚠ {imageErr}</div>}
          </div>

          {saving && (
            <div style={{ marginBottom:'16px', padding:'14px 16px', borderRadius:'12px', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.08)' }}>
              <div style={{ fontSize:'13px', color:'#c4b5fd', marginBottom:'8px' }}>{uploadPhase}</div>
              {uploadPct > 0 && uploadPct < 100 && (
                <div style={{ height:'6px', borderRadius:'6px', background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${uploadPct}%`, borderRadius:'6px', background:'linear-gradient(90deg,#7c3aed,#0891b2)', transition:'width 0.2s' }} />
                </div>
              )}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving} style={{
            width:'100%', padding:'15px', borderRadius:'12px', border:'none',
            background: saving ? 'rgba(8,145,178,0.4)' : 'linear-gradient(135deg,#0891b2,#7c3aed)',
            color:'#fff', fontWeight:700, fontSize:'15px',
            cursor: saving ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          }}>
            {saving ? (
              <>
                <span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
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