import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

/* ─── config ──────────────────────────────────────────── */
const MAX_MB      = 5;
const MAX_BYTES   = MAX_MB * 1024 * 1024;
const IMG_MAX_PX  = 1200;
const IMG_QUALITY = 0.75;

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const ORG_TYPES = [
  'Medical / Healthcare', 'Education', 'Disaster Relief',
  'Environmental', 'Child Welfare', 'Women Empowerment',
  'Animal Welfare', 'Other NGO',
];

const REQUIRED_DOCS = [
  { key: 'regCertificate', label: 'Registration / Incorporation Certificate', required: true,  hint: 'Society registration, Trust deed, or Section 8 company certificate' },
  { key: 'panCard',        label: 'PAN Card of Organisation',                 required: true,  hint: "PAN card issued in the organisation's name (not personal)" },
  { key: 'authLetter',     label: 'Authorisation Letter',                     required: true,  hint: 'Letter from chairman/board authorising this person to represent the org' },
  { key: 'cert80G',        label: '80G / 12A Tax Exemption Certificate',      required: true,  hint: 'Required for donors to claim income-tax deduction on their donations' },
  { key: 'auditReport',    label: 'Latest Audited Financial Report',           required: false, hint: 'Annual audit report for the most recent financial year' },
];

/* ─── format validators ───────────────────────────────── */
const VALIDATORS = {
  orgName:         v => !v.trim() ? 'Organisation name is required' : v.trim().length < 3 ? 'Must be at least 3 characters' : null,
  orgType:         v => !v ? 'Please select an organisation type' : null,
  regNumber:       v => !v.trim() ? 'Registration number is required' : v.trim().length < 4 ? 'Enter a valid registration number' : null,
  panNumber:       v => { if (!v.trim()) return 'PAN number is required'; const pan = v.trim().toUpperCase(); return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan) ? null : 'Invalid PAN format — must be like ABCDE1234F'; },
  yearEstablished: v => { if (!v) return null; const yr = parseInt(v, 10); const now = new Date().getFullYear(); return (isNaN(yr) || yr < 1800 || yr > now) ? `Enter a year between 1800 and ${now}` : null; },
  city:            v => !v.trim() ? 'City is required' : null,
  state:           v => !v.trim() ? 'State is required' : null,
  website:         v => { if (!v.trim()) return null; try { new URL(v.trim()); return null; } catch { return 'Enter a valid URL (e.g. https://example.org)'; } },
  description:     v => !v.trim() ? 'Description is required' : v.trim().length < 30 ? 'At least 30 characters required' : null,
  contactName:     v => !v.trim() ? 'Contact person name is required' : null,
  contactPhone:    v => { const d = v.replace(/\D/g, ''); if (!d) return 'Phone number is required'; if (d.length !== 10) return 'Enter a 10-digit mobile number'; if (!/^[6-9]/.test(d)) return 'Must start with 6, 7, 8, or 9'; return null; },
};

/* ─── format validation checks (for risk score) ──────── */
function runFormatChecks(form) {
  const checks = [];
  const pan = (form.panNumber || '').trim().toUpperCase();
  checks.push({ label: 'PAN format',          pass: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan),   detail: pan ? `PAN: ${pan}` : 'Not provided' });
  checks.push({ label: 'Registration number', pass: (form.regNumber || '').trim().length >= 4,   detail: form.regNumber || 'Not provided' });
  checks.push({ label: 'Phone number',        pass: /^[6-9]\d{9}$/.test(form.contactPhone.replace(/\D/g,'')), detail: form.contactPhone || 'Not provided' });
  checks.push({ label: 'Website provided',    pass: !!form.website.trim(),                       detail: form.website || 'No website' });
  checks.push({ label: 'Year established',    pass: !!form.yearEstablished,                      detail: form.yearEstablished ? `Est. ${form.yearEstablished}` : 'Not provided' });
  const score = Math.round((checks.filter(c => c.pass).length / checks.length) * 100);
  return { checks, score };
}

/* ─── risk score calculator ────────────────────────────────────────────────
   The AI confidence_score IS the primary score. Format checks only add a
   small bonus (max +10) on top — they can NEVER compensate for a bad document.

   Logic:
   • AI confidence_score drives everything (0-100 from AI)
   • Format bonus: max +10 added only if AI score >= 65 (don't reward valid forms with bad docs)
   • Final >= 65 → MEDIUM → admin review
   • Final <  65 → HIGH   → auto-rejected immediately
   • No auto-approve — admin must always sign off
   ──────────────────────────────────────────────────────────────────────── */
function calculateRiskScore(formatScore, aiResult) {
  const aiConfidence = typeof aiResult?.confidence_score === 'number'
    ? Math.max(0, Math.min(100, aiResult.confidence_score))
    : 0;

  // Format bonus: only reward good form data when the document itself is also good
  // Max +10 points, never enough to push a bad doc (< 65) over the threshold
  const formatBonus = aiConfidence >= 65 ? Math.round(formatScore * 0.10) : 0;

  const total = Math.min(100, aiConfidence + formatBonus);

  // Build breakdown for admin panel display
  const breakdown = {
    aiConfidence,
    formatBonus,
    documentClassification: aiResult?.document_classification || 'unknown',
    decision: aiResult?.decision || (total >= 65 ? 'manual_review' : 'reject'),
  };

  return {
    total,
    breakdown,
    level: total >= 65 ? 'MEDIUM' : 'HIGH',
  };
}

/* ─── AI document verification ────────────────────────────────────────────
   Uses the strict deduction-based prompt (start 100, deduct heavily).
   • No image → score 0 immediately, no API call
   • Wrong document type → deduct 80-95 → well below 65 threshold
   • Unrelated image / screenshot / code → deduct 95 → score ~5
   • Real certificate, name/reg mismatch → score 35-50
   • Real certificate, all matches → score 70-95
   ──────────────────────────────────────────────────────────────────────── */
async function verifyOrgWithAI(form, imgBase64, imgType) {
  // Hard gate: no image = score 0, don't even call the API
  if (!imgBase64) {
    return {
      document_classification: 'no_image',
      confidence_score:        0,
      decision:                'reject',
      matched_fields: { organization_name: false, registration_number: false, location: false, purpose: false },
      extracted_text_summary:  'No image provided — PDF uploaded or file missing.',
      red_flags: [
        'Registration certificate uploaded as PDF — AI can only analyze JPG/PNG images',
        'Re-upload the registration certificate as a clear JPG or PNG photo',
      ],
      reasoning: 'No image was available for analysis. Score set to 0. Application auto-rejected.',
      // Legacy fields kept for AdminPanel VerificationBreakdown compatibility
      extractedOrgName:          null,
      extractedRegNumber:        null,
      extractedAuthority:        null,
      extractedDate:             null,
      nameMatch:                 false,
      regNumberMatch:            false,
      documentAuthenticityScore: 0,
      documentType:              'No image provided',
      redFlags: ['PDF uploaded — AI requires JPG/PNG image for verification', 'Re-upload as a clear photo of the registration certificate'],
      summary:  'No image available. Score 0. Auto-rejected.',
    };
  }

  const prompt = `You are a STRICT NGO document verification engine for a donation platform called TransparentFund.

YOUR ROLE: Reject anything suspicious, unrelated, mismatched, incomplete, or fake-looking. Do NOT be generous.

REGISTRATION FORM DETAILS (what the applicant declared):
- Organisation Name: "${form.orgName}"
- Registration Number: "${form.regNumber}"
- PAN Number: "${form.panNumber}"
- Organisation Type: "${form.orgType}"
- City: "${form.city}"
- State: "${form.state}"
- Year Established: "${form.yearEstablished || 'not provided'}"
- Contact Name: "${form.contactName}"
- Mission: "${form.description}"

EXPECTED DOCUMENT: Indian NGO / Trust / Society / Section-8 Company Registration Certificate

VERIFICATION STEPS (in order):

STEP 1 — DOCUMENT RELEVANCE:
Classify the uploaded image as one of:
  correct_document — it IS a registration/incorporation certificate for an Indian NGO/Trust/Society
  wrong_document   — it is a document but NOT a registration certificate (e.g. PAN card, bank statement, invoice)
  unrelated_image  — completely unrelated (photo, product image, screenshot of website/app)
  code_image       — screenshot of code, terminal, IDE, or programming content
  screenshot       — screenshot of a webpage, UI, or digital document
  blank            — blank, mostly empty, or unreadable image

STEP 2 — OCR & READABILITY:
Extract any text visible. Can you read organisation name and registration number clearly?

STEP 3 — AUTHENTICITY SIGNALS:
Look for: edited/pasted text, mixed fonts, suspicious logos, AI-generated artifacts, inconsistent layout,
unnatural seals or signatures, impossible dates, cropped or cut corners.

STEP 4 — DATA MATCH:
Compare what you see in the document against the declared details.

STEP 5 — RISK SCORING (START FROM 100, DEDUCT):
Apply these deductions:
  wrong_document:   -80
  unrelated_image:  -95
  code_image:       -95
  screenshot:       -90
  blank:            -100
  Unreadable:       -40
  Name mismatch:    -25
  Reg# mismatch:    -35
  Suspicious edits: -40
  AI-generated:     -45
  Missing official structure (no seal, no authority name, no date): -30

MINIMUM SCORES BY CLASSIFICATION:
  code_image or unrelated_image: score MUST be ≤ 10
  wrong_document: score MUST be ≤ 25
  screenshot: score MUST be ≤ 15
  correct_document with all matches: score 70–95

Return ONLY valid JSON — no markdown, no extra text, no backticks:
{
  "document_classification": "<correct_document|wrong_document|unrelated_image|code_image|screenshot|blank>",
  "confidence_score": <integer 0-100 after deductions>,
  "decision": "<reject|manual_review>",
  "matched_fields": {
    "organization_name": <true|false|null>,
    "registration_number": <true|false|null>,
    "location": <true|false|null>,
    "purpose": <true|false|null>
  },
  "extracted_text_summary": "<key text extracted from the document, or explain why none was found>",
  "red_flags": ["<specific flag 1>", "<specific flag 2>"],
  "reasoning": "<2-3 sentences explaining your classification and score>",
  "extractedOrgName": "<org name found in doc or null>",
  "extractedRegNumber": "<reg number found in doc or null>",
  "extractedAuthority": "<issuing authority or null>",
  "extractedDate": "<date visible or null>",
  "nameMatch": <true|false|null>,
  "regNumberMatch": <true|false|null>,
  "documentAuthenticityScore": <same as confidence_score>,
  "documentType": "<same as document_classification in readable form>",
  "redFlags": ["<same as red_flags>"],
  "summary": "<same as reasoning in one sentence>"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 900,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imgType, data: imgBase64 } },
            { type: 'text',  text: prompt },
          ],
        }],
      }),
    });
    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? '';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    // Enforce minimum scores per classification — model must not override these
    const cls = parsed.document_classification || '';
    const enforceMax = {
      code_image:      10,
      unrelated_image: 10,
      screenshot:      15,
      wrong_document:  25,
      blank:           0,
    };
    if (enforceMax[cls] !== undefined) {
      parsed.confidence_score        = Math.min(parsed.confidence_score ?? 0, enforceMax[cls]);
      parsed.documentAuthenticityScore = parsed.confidence_score;
    }

    // Always clamp between 0-100
    parsed.confidence_score        = Math.max(0, Math.min(100, parsed.confidence_score ?? 0));
    parsed.documentAuthenticityScore = parsed.confidence_score;

    // Enforce decision consistency with score
    parsed.decision = parsed.confidence_score >= 65 ? 'manual_review' : 'reject';

    return parsed;
  } catch (e) {
    // API error — score 0, don't give neutral
    return {
      document_classification: 'api_error',
      confidence_score:        0,
      decision:                'reject',
      matched_fields: { organization_name: null, registration_number: null, location: null, purpose: null },
      extracted_text_summary:  'AI service unavailable.',
      red_flags:               ['AI verification service error — admin must manually verify'],
      reasoning:               'AI verification failed. Score set to 0. Admin must manually verify all documents.',
      extractedOrgName:          null,
      extractedRegNumber:        null,
      extractedAuthority:        null,
      extractedDate:             null,
      nameMatch:                 null,
      regNumberMatch:            null,
      documentAuthenticityScore: 0,
      documentType:              'AI error',
      redFlags:                  ['AI verification failed — manual review required'],
      summary:                   'AI service error. Score 0.',
    };
  }
}

/* ─── compress image ──────────────────────────────────── */
async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 300 * 1024) return file;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > IMG_MAX_PX || height > IMG_MAX_PX) {
        const r = Math.min(IMG_MAX_PX / width, IMG_MAX_PX / height);
        width = Math.round(width * r); height = Math.round(height * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })), 'image/jpeg', IMG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ─── Cloudinary upload — NO eager param ─────────────── */
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', 'ngoRequests');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
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

/* ─── shared styles ───────────────────────────────────── */
const INPUT_BASE = { width:'100%', padding:'11px 14px', borderRadius:'10px', background:'#111827', color:'#fff', fontSize:'14px', outline:'none', boxSizing:'border-box', transition:'border-color 0.2s' };
const inp  = (err, touched) => ({ ...INPUT_BASE, border: err && touched ? '1px solid rgba(239,68,68,0.7)' : '1px solid rgba(255,255,255,0.12)' });
const LABEL = { fontSize:'12px', fontWeight:600, color:'rgba(255,255,255,0.5)', letterSpacing:'0.4px', marginBottom:'6px', display:'block' };
const ERR   = { fontSize:'11px', color:'#f87171', marginTop:'4px' };
const SEC   = { fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'16px', paddingBottom:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' };

function Field({ label, required, error, touched, hint, children }) {
  return (
    <div>
      <label style={LABEL}>
        {label}
        {required ? <span style={{ color:'#f87171', marginLeft:'4px' }}>*</span>
          : <span style={{ color:'rgba(255,255,255,0.25)', marginLeft:'6px', fontSize:'11px' }}>(optional)</span>}
      </label>
      {hint && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.28)', marginBottom:'6px' }}>{hint}</div>}
      {children}
      {error && touched && <div style={ERR}>⚠ {error}</div>}
    </div>
  );
}

function FileField({ docDef, value, error, onChange }) {
  const ref   = useRef();
  const valid = value && !error;
  const bc    = error ? 'rgba(239,68,68,0.6)' : valid ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.12)';
  return (
    <div>
      <label style={LABEL}>
        {docDef.label}
        {docDef.required ? <span style={{ color:'#f87171', marginLeft:'4px' }}>*</span>
          : <span style={{ color:'rgba(255,255,255,0.25)', marginLeft:'6px', fontSize:'11px' }}>(optional)</span>}
      </label>
      <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.28)', marginBottom:'6px' }}>{docDef.hint}</div>
      <div onClick={() => ref.current.click()} style={{ ...INPUT_BASE, cursor:'pointer', border:`1px solid ${bc}`, display:'flex', alignItems:'center', gap:'10px', justifyContent:'space-between' }}>
        <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e => onChange(docDef.key, e.target.files[0])} />
        <span style={{ color: valid ? '#c4b5fd' : error ? '#fca5a5' : 'rgba(255,255,255,0.3)', fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {error ? `⚠ ${error}` : valid ? `✓  ${value.name}` : 'Click to upload — PDF, JPG or PNG'}
        </span>
        <span style={{ padding:'4px 12px', borderRadius:'6px', fontSize:'11px', fontWeight:700, flexShrink:0, background: valid ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.07)', color: valid ? '#c4b5fd' : 'rgba(255,255,255,0.4)', border:`1px solid ${valid ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
          {valid ? 'Change' : 'Browse'}
        </span>
      </div>
      {value && !error && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.25)', marginTop:'4px' }}>{(value.size/1024/1024).toFixed(2)} MB{value.type.startsWith('image/') && ' · will be compressed'}</div>}
      {/* Warn if PDF — AI can't analyze it */}
      {value && !error && value.type === 'application/pdf' && docDef.key === 'regCertificate' && (
        <div style={{ fontSize:'11px', color:'#fcd34d', marginTop:'4px', padding:'6px 10px', borderRadius:'8px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)' }}>
          ⚠ PDF uploaded — AI can only analyze images (JPG/PNG). For higher verification score, upload as image.
        </div>
      )}
    </div>
  );
}

function ApprovalPopup({ onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ width:'100%', maxWidth:'460px', borderRadius:'24px', border:'1px solid rgba(16,185,129,0.4)', background:'#0d1021', padding:'40px', textAlign:'center', boxShadow:'0 0 60px rgba(16,185,129,0.15)' }}>
        <div style={{ fontSize:'56px', marginBottom:'16px' }}>🎉</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>Organisation Approved!</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'14px', lineHeight:1.7, marginBottom:'24px' }}>Your organisation has been verified. You can now create campaigns and start raising funds.</p>
        <div style={{ padding:'14px 16px', borderRadius:'12px', marginBottom:'28px', border:'1px solid rgba(16,185,129,0.3)', background:'rgba(16,185,129,0.08)', fontSize:'13px', color:'#6ee7b7', lineHeight:1.8, textAlign:'left' }}>
          ✅ Create fundraising campaigns<br />✅ Upload milestone proof documents<br />✅ Track fund releases in real time<br />✅ Receive verified donor contributions
        </div>
        <button onClick={onClose} style={{ width:'100%', padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#10b981,#0891b2)', color:'#fff', fontWeight:700, fontSize:'15px', cursor:'pointer' }}>Get Started →</button>
      </div>
    </div>
  );
}

/* ─── main ────────────────────────────────────────────── */
export default function NgoDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [status,      setStatus]      = useState('loading');
  const [showPopup,   setShowPopup]   = useState(false);
  const [campaigns,   setCampaigns]   = useState([]);
  const [totalRaised, setTotalRaised] = useState(0);

  const [form, setForm] = useState({
    orgName:'', orgType:'', regNumber:'', panNumber:'', yearEstablished:'',
    city:'', state:'', website:'', description:'', contactName:'', contactPhone:'',
  });
  const [touched,   setTouched]   = useState({});
  const [docFiles,  setDocFiles]  = useState({});
  const [docErrors, setDocErrors] = useState({});

  const [uploading,   setUploading]   = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadPct,   setUploadPct]   = useState(0);
  const [totalFiles,  setTotalFiles]  = useState(0);
  const [doneFiles,   setDoneFiles]   = useState(0);

  const [verifying,   setVerifying]   = useState(false);
  const [verifyLabel, setVerifyLabel] = useState('');
  const [verifyStep,  setVerifyStep]  = useState(0);

  const setField        = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const getError        = k => VALIDATORS[k] ? VALIDATORS[k](form[k]) : null;
  const handleDocChange = (key, file) => {
    if (!file) return;
    const err = file.size > MAX_BYTES ? `Too large (max ${MAX_MB} MB)` : null;
    setDocErrors(e => ({ ...e, [key]: err }));
    setDocFiles(d => ({ ...d, [key]: err ? null : file }));
  };

  useEffect(() => {
    if (!user) return;
    if (role === 'admin') { navigate('/admin', { replace: true }); return; }

    if (role === 'ngo') {
      (async () => {
        const snap = await getDocs(query(collection(db, 'ngoRequests'), where('uid', '==', user.uid), limit(5)));
        const hasApproved = snap.docs.some(d => d.data()?.status === 'approved');
        if (hasApproved) {
          setStatus('approved');
          const key = `ngo_approved_seen_${user.uid}`;
          if (!localStorage.getItem(key)) { setShowPopup(true); localStorage.setItem(key, '1'); }
          getDocs(query(collection(db, 'campaigns'), where('ngoId', '==', user.uid))).then(s => {
            const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setCampaigns(list);
            setTotalRaised(list.reduce((sum, c) => sum + (c.raisedAmount || 0), 0));
          });
        } else if (snap.empty) {
          setStatus('none');
        } else {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          items.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          setStatus(items[0].status || 'pending');
        }
      })();
      return;
    }

    (async () => {
      const snap = await getDocs(query(collection(db, 'ngoRequests'), where('uid', '==', user.uid), limit(5)));
      if (snap.empty) { setStatus('none'); return; }
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setStatus(items[0].status || 'pending');
    })();
  }, [user, role]);

  /* ── Full submission with verification pipeline ── */
  const handleSubmit = async () => {
    const allKeys = Object.keys(VALIDATORS);
    setTouched(allKeys.reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    const fieldErrors = allKeys.map(k => VALIDATORS[k](form[k])).filter(Boolean);
    if (fieldErrors.length) return;

    const missingDocs = REQUIRED_DOCS.filter(d => d.required && !docFiles[d.key]);
    if (missingDocs.length) { alert(`Please upload: ${missingDocs.map(d => d.label).join(', ')}`); return; }
    if (Object.values(docErrors).some(Boolean)) { alert('Please fix file errors first.'); return; }

    /* ── PHASE 1: Upload documents ── */
    setUploading(true);
    const filesToUpload = REQUIRED_DOCS.filter(d => docFiles[d.key]);
    setTotalFiles(filesToUpload.length);
    setDoneFiles(0);

    const urls = {};
    let regCertBase64 = null, regCertType = null;

    try {
      let done = 0;
      for (const docDef of filesToUpload) {
        setUploadLabel(docDef.label);
        setUploadPct(0);
        const raw        = docFiles[docDef.key];
        const compressed = await compressImage(raw);

        // Capture reg certificate as base64 for AI analysis — only if it's an image
        if (docDef.key === 'regCertificate' && raw.type.startsWith('image/')) {
          await new Promise(res => {
            const reader = new FileReader();
            reader.onload = e => { regCertBase64 = e.target.result.split(',')[1]; regCertType = raw.type; res(); };
            reader.readAsDataURL(compressed);
          });
        }

        urls[docDef.key] = await uploadToCloudinary(compressed, pct => setUploadPct(pct));
        done++;
        setDoneFiles(done);
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
      setUploading(false); return;
    }
    setUploading(false);

    /* ── PHASE 2: Verification pipeline ── */
    setVerifying(true);

    setVerifyLabel('Validating PAN, registration number, phone format…');
    setVerifyStep(1);
    const formatResult = runFormatChecks(form);
    await new Promise(r => setTimeout(r, 400));

    setVerifyLabel('Running AI document analysis on registration certificate…');
    setVerifyStep(2);
    const aiResult = await verifyOrgWithAI(form, regCertBase64, regCertType);

    setVerifyLabel('Cross-checking document consistency…');
    setVerifyStep(3);
    await new Promise(r => setTimeout(r, 300));

    setVerifyLabel('Calculating risk score…');
    setVerifyStep(4);
    const riskScore = calculateRiskScore(formatResult.score, aiResult);
    await new Promise(r => setTimeout(r, 200));

    setVerifyLabel('Saving registration…');
    setVerifyStep(5);

    /* ── THRESHOLD LOGIC ──────────────────────────────
       riskScore.total >= 65 → MEDIUM → status = 'pending' (goes to admin)
       riskScore.total < 65  → HIGH   → status = 'rejected' (auto-rejected)
       There is no auto-approval — admin must always approve.
       ──────────────────────────────────────────────────── */
    const finalStatus = riskScore.total >= 65 ? 'pending' : 'rejected';

    try {
      await addDoc(collection(db, 'ngoRequests'), {
        uid:      user.uid,
        email:    user.email       || '',
        name:     user.displayName || '',
        photoURL: user.photoURL    || '',
        status:   finalStatus,
        ...form,
        documents: urls,
        aiVerification: {
          formatChecks:    formatResult.checks,
          formatScore:     formatResult.score,
          aiExtracted: {
            orgName:      aiResult.extractedOrgName,
            regNumber:    aiResult.extractedRegNumber,
            authority:    aiResult.extractedAuthority,
            registeredOn: aiResult.extractedDate,
            documentType: aiResult.document_classification || aiResult.documentType,
          },
          // Primary AI score — confidence_score from new prompt, fallback to legacy field
          aiScore:                aiResult.confidence_score ?? aiResult.documentAuthenticityScore ?? 0,
          documentClassification: aiResult.document_classification || 'unknown',
          aiDecision:             aiResult.decision || 'reject',
          matchedFields:          aiResult.matched_fields || {},
          extractedTextSummary:   aiResult.extracted_text_summary || '',
          reasoning:              aiResult.reasoning || aiResult.summary || '',
          nameMatch:              aiResult.nameMatch ?? aiResult.matched_fields?.organization_name ?? null,
          regMatch:               aiResult.regNumberMatch ?? aiResult.matched_fields?.registration_number ?? null,
          redFlags:               aiResult.red_flags || aiResult.redFlags || [],
          aiSummary:              aiResult.reasoning || aiResult.summary || '',
          riskScore:              riskScore.total,
          riskLevel:              riskScore.level,
          scoreBreakdown:         riskScore.breakdown,
          verifiedAt:             new Date().toISOString(),
        },
        createdAt: serverTimestamp(),
      });
      // Show the correct state based on AI outcome
      setStatus(finalStatus);
    } catch (e) {
      alert('Submission failed: ' + e.message);
    } finally {
      setVerifying(false);
    }
  };

  if (status === 'loading') return (
    <div style={{ padding:'80px 48px', color:'rgba(255,255,255,0.35)', fontSize:'14px' }}>Loading…</div>
  );

  if (status === 'approved') return (
    <>
      {showPopup && <ApprovalPopup onClose={() => setShowPopup(false)} />}
      <div style={{ padding:'40px 48px', maxWidth:'900px' }}>
        <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#10b981', marginBottom:'8px' }}>NGO Dashboard</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'30px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>
          Welcome, {user?.displayName?.split(' ')[0] || 'Organisation'}
        </h2>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'36px' }}>Manage campaigns, upload milestone proofs, and track fund releases.</p>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'28px' }}>
          {[
            { label:'Active campaigns', val: campaigns.filter(c => c.status === 'active').length.toString(), color:'#a78bfa' },
            { label:'Total raised',     val: `₹${totalRaised.toLocaleString('en-IN')}`,                      color:'#22d3ee' },
            { label:'Total donors',     val: campaigns.reduce((s, c) => s + (c.donorCount || 0), 0).toString(), color:'#34d399' },
          ].map(s => (
            <div key={s.label} style={{ borderRadius:'16px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'20px', textAlign:'center' }}>
              <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'28px', fontWeight:800, color:s.color, marginBottom:'4px' }}>{s.val}</div>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {campaigns.length > 0 && (
          <div style={{ marginBottom:'28px', borderRadius:'16px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', overflow:'hidden' }}>
            <div style={{ padding:'16px 24px', borderBottom:'1px solid rgba(255,255,255,0.06)', fontWeight:700, color:'#fff', fontSize:'14px' }}>My Campaigns</div>
            {campaigns.map(c => {
              const raised    = c.raisedAmount || 0;
              const target    = c.targetAmount || 0;
              const remaining = Math.max(0, target - raised);
              const pct       = target ? Math.min(Math.round((raised / target) * 100), 100) : 0;
              return (
                <div key={c.id} style={{ padding:'16px 24px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', gap:'16px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', fontWeight:600, color:'#fff', marginBottom:'6px' }}>{c.title}</div>
                    <div style={{ height:'4px', borderRadius:'4px', background:'rgba(255,255,255,0.08)', overflow:'hidden', marginBottom:'4px' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius:'4px' }} />
                    </div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>₹{remaining.toLocaleString('en-IN')} remaining of ₹{target.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'13px', fontWeight:700, color:'#22d3ee' }}>₹{raised.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>{pct}% raised</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
          <Link to="/create-campaign" style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'12px 24px', borderRadius:'12px', background:'linear-gradient(135deg,#10b981,#0891b2)', color:'#fff', fontWeight:700, fontSize:'14px', textDecoration:'none' }}>🚀 Create Campaign</Link>
          <Link to="/proof" style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'12px 24px', borderRadius:'12px', background:'linear-gradient(135deg,#7c3aed,#0891b2)', color:'#fff', fontWeight:700, fontSize:'14px', textDecoration:'none' }}>📄 Upload Milestone Proof</Link>
          <Link to="/campaigns" style={{ display:'inline-flex', alignItems:'center', padding:'12px 24px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontWeight:700, fontSize:'14px', textDecoration:'none' }}>Browse Campaigns</Link>
        </div>
      </div>
    </>
  );

  if (status === 'pending') return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px' }}>
      <div style={{ width:'100%', maxWidth:'520px', padding:'40px', borderRadius:'20px', border:'1px solid rgba(245,158,11,0.35)', background:'rgba(245,158,11,0.05)', textAlign:'center' }}>
        <div style={{ fontSize:'52px', marginBottom:'16px' }}>⏳</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>Application under review</h2>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:'14px', lineHeight:1.7, marginBottom:'20px' }}>
          AI verification passed. Your application is now with an admin who will review your documents within 1–2 business days.
        </p>
        <div style={{ padding:'12px 16px', borderRadius:'10px', marginBottom:'24px', border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.1)', fontSize:'13px', color:'#fcd34d', lineHeight:1.6 }}>
          💡 After approval, sign out and sign back in to unlock the full NGO dashboard.
        </div>
        <Link to="/" style={{ display:'inline-block', padding:'11px 28px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px', textDecoration:'none' }}>← Back to home</Link>
      </div>
    </div>
  );

  if (status === 'rejected') return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px' }}>
      <div style={{ width:'100%', maxWidth:'520px', padding:'40px', borderRadius:'20px', border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.05)', textAlign:'center' }}>
        <div style={{ fontSize:'52px', marginBottom:'16px' }}>❌</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>Application rejected by AI verification</h2>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:'14px', lineHeight:1.7, marginBottom:'16px' }}>
          Your registration certificate could not be verified. This happens when:
        </p>
        <div style={{ padding:'14px 16px', borderRadius:'12px', marginBottom:'20px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', fontSize:'13px', color:'#fca5a5', lineHeight:1.8, textAlign:'left' }}>
          • The registration certificate was uploaded as a PDF (upload as JPG/PNG image)<br />
          • The document does not show your organisation name + registration number<br />
          • The name/reg number in the document doesn't match what you declared<br />
          • The document appears to be a different type of file
        </div>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'24px' }}>
          Please reapply with a clear JPG/PNG photo of your registration certificate where your organisation name and registration number are clearly visible.
        </p>
        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <button onClick={() => setStatus('none')} style={{ padding:'11px 24px', borderRadius:'10px', border:'none', background:'#7c3aed', color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>Reapply</button>
          <Link to="/" style={{ display:'inline-block', padding:'11px 24px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px', textDecoration:'none' }}>← Home</Link>
        </div>
      </div>
    </div>
  );

  /* ── REGISTRATION FORM ── */
  const VERIFY_STEPS = ['Uploading documents', 'Format validation', 'AI document analysis', 'Consistency check', 'Risk scoring', 'Saving'];

  return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'48px 16px 80px' }}>
      <div style={{ width:'100%', maxWidth:'720px' }}>
        <Link to="/" style={{ display:'inline-flex', alignItems:'center', gap:'6px', color:'rgba(255,255,255,0.35)', fontSize:'13px', textDecoration:'none', marginBottom:'28px' }}>← Back to home</Link>
        <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#22d3ee', marginBottom:'8px' }}>Organisation Registration</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'28px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>Register your organisation</h2>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'32px', lineHeight:1.6 }}>
          Fill in your details and upload documents. Our AI pipeline verifies every submission before admin review.
        </p>

        {/* Threshold info */}
        <div style={{ padding:'14px 18px', borderRadius:'12px', marginBottom:'24px', border:'1px solid rgba(245,158,11,0.25)', background:'rgba(245,158,11,0.06)', fontSize:'13px', color:'#fcd34d', lineHeight:1.7 }}>
          ⚠️ <strong>Important:</strong> Upload your Registration Certificate as a <strong>JPG or PNG image</strong> (not PDF) for AI verification. If uploaded as PDF, the AI cannot analyze it and your application will be auto-rejected. Score ≥ 65 → Admin review. Score &lt; 65 → Auto-rejected.
        </div>

        {/* Pipeline explainer */}
        <div style={{ padding:'16px 20px', borderRadius:'14px', marginBottom:'28px', border:'1px solid rgba(124,58,237,0.25)', background:'rgba(124,58,237,0.06)' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#c4b5fd', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>Verification pipeline</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
            {['📝 Format checks', '🤖 AI document extraction', '🔗 Cross-document consistency', '📊 Risk scoring', '👁️ Admin review'].map((s, i) => (
              <span key={i} style={{ padding:'4px 10px', borderRadius:'8px', fontSize:'11px', background:'rgba(124,58,237,0.12)', border:'1px solid rgba(124,58,237,0.25)', color:'#c4b5fd' }}>{s}</span>
            ))}
          </div>
        </div>

        <div style={{ borderRadius:'20px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'32px' }}>

          <div style={SEC}>Basic information</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Organisation name" required error={getError('orgName')} touched={touched.orgName}>
              <input value={form.orgName} onChange={e => setField('orgName', e.target.value)} onBlur={() => setTouched(t => ({ ...t, orgName:true }))} placeholder="e.g. Helping Hands Foundation" style={inp(getError('orgName'), touched.orgName)} />
            </Field>
            <Field label="Organisation type" required error={getError('orgType')} touched={touched.orgType}>
              <select value={form.orgType} onChange={e => setField('orgType', e.target.value)} onBlur={() => setTouched(t => ({ ...t, orgType:true }))} style={{ ...inp(getError('orgType'), touched.orgType), WebkitAppearance:'none', cursor:'pointer' }}>
                <option value="" style={{ background:'#111827' }}>Select type…</option>
                {ORG_TYPES.map(t => <option key={t} value={t} style={{ background:'#111827' }}>{t}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Registration / Certificate number" required error={getError('regNumber')} touched={touched.regNumber}
              hint="Must match exactly what's on your registration certificate">
              <input value={form.regNumber} onChange={e => setField('regNumber', e.target.value)} onBlur={() => setTouched(t => ({ ...t, regNumber:true }))} placeholder="e.g. MH/NGO/12345/2018" style={inp(getError('regNumber'), touched.regNumber)} />
            </Field>
            <Field label="Organisation PAN number" required error={getError('panNumber')} touched={touched.panNumber}
              hint="Format: ABCDE1234F — must match your PAN card">
              <input value={form.panNumber} onChange={e => setField('panNumber', e.target.value.toUpperCase().slice(0,10))} onBlur={() => setTouched(t => ({ ...t, panNumber:true }))} placeholder="e.g. AABCH1234C" maxLength={10} style={inp(getError('panNumber'), touched.panNumber)} />
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="City" required error={getError('city')} touched={touched.city}>
              <input value={form.city} onChange={e => setField('city', e.target.value)} onBlur={() => setTouched(t => ({ ...t, city:true }))} placeholder="e.g. Pune" style={inp(getError('city'), touched.city)} />
            </Field>
            <Field label="State" required error={getError('state')} touched={touched.state}>
              <input value={form.state} onChange={e => setField('state', e.target.value)} onBlur={() => setTouched(t => ({ ...t, state:true }))} placeholder="e.g. Maharashtra" style={inp(getError('state'), touched.state)} />
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Year established" error={getError('yearEstablished')} touched={touched.yearEstablished}>
              <input type="number" min="1800" max={new Date().getFullYear()} value={form.yearEstablished} onChange={e => setField('yearEstablished', e.target.value)} onBlur={() => setTouched(t => ({ ...t, yearEstablished:true }))} placeholder="e.g. 2015" style={inp(getError('yearEstablished'), touched.yearEstablished)} />
            </Field>
            <Field label="Website" error={getError('website')} touched={touched.website}>
              <input type="text" value={form.website} onChange={e => setField('website', e.target.value)} onBlur={() => setTouched(t => ({ ...t, website:true }))} placeholder="https://yourorg.org" style={inp(getError('website'), touched.website)} />
            </Field>
          </div>

          <div style={{ marginBottom:'28px' }}>
            <Field label="Mission & description" required error={getError('description')} touched={touched.description} hint={`${form.description.trim().length}/30 characters minimum`}>
              <textarea rows={4} value={form.description} onChange={e => setField('description', e.target.value)} onBlur={() => setTouched(t => ({ ...t, description:true }))} placeholder="Describe your organisation's mission and work…" style={{ ...inp(getError('description'), touched.description), resize:'vertical', lineHeight:1.65 }} />
            </Field>
          </div>

          <div style={SEC}>Contact details</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'28px' }}>
            <Field label="Contact person name" required error={getError('contactName')} touched={touched.contactName}>
              <input value={form.contactName} onChange={e => setField('contactName', e.target.value)} onBlur={() => setTouched(t => ({ ...t, contactName:true }))} placeholder="e.g. Priya Sharma" style={inp(getError('contactName'), touched.contactName)} />
            </Field>
            <Field label="Contact phone" required error={getError('contactPhone')} touched={touched.contactPhone} hint="10-digit Indian mobile">
              <input type="tel" maxLength={10} value={form.contactPhone} onChange={e => setField('contactPhone', e.target.value.replace(/\D/g,'').slice(0,10))} onBlur={() => setTouched(t => ({ ...t, contactPhone:true }))} placeholder="e.g. 9876543210" style={inp(getError('contactPhone'), touched.contactPhone)} />
            </Field>
          </div>

          <div style={SEC}>Verification documents</div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.3)', marginBottom:'18px', lineHeight:1.6 }}>
            PDF, JPG or PNG — max {MAX_MB} MB each.<br />
            <strong style={{ color:'#fcd34d' }}>⚠ Upload the Registration Certificate as JPG/PNG (not PDF)</strong> — AI can only analyze images.<br />
            <span style={{ color:'#f87171' }}>*</span> = required.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'28px' }}>
            {REQUIRED_DOCS.map(d => <FileField key={d.key} docDef={d} value={docFiles[d.key]} error={docErrors[d.key]} onChange={handleDocChange} />)}
          </div>

          <div style={{ padding:'14px 16px', borderRadius:'10px', marginBottom:'24px', border:'1px solid rgba(34,211,238,0.25)', background:'rgba(34,211,238,0.06)', fontSize:'13px', color:'#67e8f9', lineHeight:1.65 }}>
            📋 After submission, AI will analyze your registration certificate and calculate a risk score. Score ≥ 65 → Admin review within 1–2 business days. Score &lt; 65 → Auto-rejected with reason.
          </div>

          {/* Upload progress */}
          {uploading && (
            <div style={{ marginBottom:'20px', padding:'16px 18px', borderRadius:'14px', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#c4b5fd', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{uploadLabel}</div>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', flexShrink:0 }}>File {doneFiles + 1} of {totalFiles}</div>
              </div>
              <div style={{ height:'6px', borderRadius:'6px', background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:'6px', background:'linear-gradient(90deg,#7c3aed,#0891b2)', width:`${Math.round((doneFiles / totalFiles) * 100 + uploadPct / totalFiles)}%`, transition:'width 0.2s' }} />
              </div>
            </div>
          )}

          {/* Verification pipeline progress */}
          {verifying && (
            <div style={{ marginBottom:'20px', padding:'18px 20px', borderRadius:'14px', border:'1px solid rgba(34,211,238,0.3)', background:'rgba(34,211,238,0.06)' }}>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#67e8f9', marginBottom:'14px' }}>🤖 {verifyLabel}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {VERIFY_STEPS.map((step, i) => {
                  const done   = i < verifyStep;
                  const active = i === verifyStep - 1 || (verifyStep === 0 && i === 0);
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'12px' }}>
                      <div style={{
                        width:'20px', height:'20px', borderRadius:'50%', flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:700,
                        background: done ? 'rgba(16,185,129,0.3)' : active ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)',
                        border: done ? '1px solid rgba(16,185,129,0.6)' : active ? '1px solid rgba(34,211,238,0.6)' : '1px solid rgba(255,255,255,0.1)',
                        color: done ? '#6ee7b7' : active ? '#67e8f9' : 'rgba(255,255,255,0.3)',
                      }}>{done ? '✓' : i + 1}</div>
                      <span style={{ color: done ? '#6ee7b7' : active ? '#67e8f9' : 'rgba(255,255,255,0.3)' }}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={uploading || verifying} style={{
            width:'100%', padding:'15px', borderRadius:'12px', border:'none',
            background: uploading || verifying ? 'rgba(8,145,178,0.4)' : 'linear-gradient(135deg,#0891b2,#7c3aed)',
            color:'#fff', fontWeight:700, fontSize:'15px',
            cursor: uploading || verifying ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          }}>
            {uploading || verifying ? (
              <>
                <span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                {verifying ? verifyLabel : 'Uploading…'}
              </>
            ) : 'Submit Registration for Verification & Admin Review'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}