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

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Puducherry',
];

const ORG_TYPES = [
  'Medical / Healthcare','Education','Disaster Relief','Environmental',
  'Child Welfare','Women Empowerment','Animal Welfare','Other NGO',
];

const REQUIRED_DOCS = [
  { key:'regCertificate', label:'Registration / Incorporation Certificate', required:true,  hint:'JPG or PNG only — Society registration, Trust deed, or Section 8 company certificate. AI cannot read PDFs.' },
  { key:'panCard',        label:'PAN Card of Organisation',                 required:true,  hint:'JPG or PNG — PAN card issued in the organisation\'s name (not personal)' },
  { key:'authLetter',     label:'Authorisation Letter',                     required:true,  hint:'JPG or PNG — Letter from chairman/board authorising this person to represent the org' },
  { key:'cert80G',        label:'80G / 12A Tax Exemption Certificate',      required:true,  hint:'JPG or PNG — Required for donors to claim income-tax deduction' },
  { key:'auditReport',    label:'Latest Audited Financial Report',           required:false, hint:'JPG or PNG — Annual audit report for the most recent financial year (optional but recommended)' },
];

/* ═══════════════════════════════════════════════════════
   MEANINGFUL TEXT DETECTION
   Rejects: keyboard smash, repeated chars, random strings,
   only symbols, lorem ipsum, nonsense patterns
═══════════════════════════════════════════════════════ */
function isMeaningfulText(str, minWords = 2) {
  if (!str || !str.trim()) return false;
  const s = str.trim();

  // Reject if mostly same character (e.g. "mmmmmmmmm", "aaaaaaaaa")
  const charFreq = {};
  for (const c of s.toLowerCase()) { if (c !== ' ') charFreq[c] = (charFreq[c] || 0) + 1; }
  const totalChars = s.replace(/\s/g, '').length;
  const maxFreq    = Math.max(...Object.values(charFreq));
  if (totalChars > 4 && maxFreq / totalChars > 0.55) return false;

  // Reject if no vowels (keyboard smash like "qwrtypsdfg")
  const vowels = (s.match(/[aeiouAEIOU]/g) || []).length;
  if (totalChars > 6 && vowels / totalChars < 0.05) return false;

  // Reject if contains consecutive repeated patterns (e.g. "abababab", "xyzxyzxyz")
  if (/(.{2,})\1{2,}/.test(s)) return false;

  // Reject if only numbers and symbols
  if (/^[\d\s\W]+$/.test(s)) return false;

  // Reject keyboard rows
  const noSpace = s.replace(/\s/g, '').toLowerCase();
  if (noSpace.includes('qwertyuiop') || noSpace.includes('asdfghjkl') || noSpace.includes('zxcvbnm')) return false;

  // Must have at least minWords real words (≥ 2 chars with at least 1 vowel or consonant mix)
  const words = s.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < minWords) return false;

  return true;
}

function isValidName(str) {
  // Must be 2-80 chars, contain letters, not be garbage
  const s = str.trim();
  if (!s || s.length < 2 || s.length > 80) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  return isMeaningfulText(s, 1);
}

/* ─── validators ─────────────────────────────────────── */
const VALIDATORS = {
  orgName: v => {
    if (!v.trim()) return 'Organisation name is required';
    if (v.trim().length < 3) return 'Must be at least 3 characters';
    if (v.trim().length > 80) return 'Must be under 80 characters';
    if (!isValidName(v)) return 'Please enter a real organisation name — avoid repeated characters or gibberish';
    return null;
  },
  orgType: v => !v ? 'Please select an organisation type' : null,

  regNumber: v => {
    const s = v.trim();
    if (!s) return 'Registration number is required';
    if (s.length < 5) return 'Registration number seems too short';
    if (!/[a-zA-Z]/.test(s)) return 'Registration number must contain letters (e.g. MH/NGO/12345/2018)';
    if (/^(.)\1+$/.test(s.replace(/[\s\/\-]/g, ''))) return 'Enter a valid registration number';
    return null;
  },

  panNumber: v => {
    if (!v.trim()) return 'PAN number is required';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v.trim().toUpperCase())) return 'Invalid PAN — must be like ABCDE1234F (5 letters, 4 digits, 1 letter)';
    return null;
  },

  yearEstablished: v => {
    if (!v) return 'Year established is required';
    const yr = parseInt(v, 10);
    const now = new Date().getFullYear();
    if (isNaN(yr) || yr < 1950 || yr > now) return `Enter a year between 1950 and ${now}`;
    return null;
  },

  city: v => {
    if (!v.trim()) return 'City is required';
    if (!/^[a-zA-Z\s\-'.]+$/.test(v.trim())) return 'City name should contain only letters';
    if (v.trim().length < 2) return 'Enter a valid city name';
    return null;
  },

  state: v => !v ? 'Please select a state' : null,

  website: v => {
    if (!v.trim()) return 'Website is required';
    let url = v.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      const u = new URL(url);
      if (!u.hostname.includes('.')) return 'Enter a valid website URL (e.g. https://yourorg.org)';
      return null;
    } catch {
      return 'Enter a valid website URL (e.g. https://yourorg.org)';
    }
  },

  description: v => {
    if (!v.trim()) return 'Mission description is required';
    if (v.trim().length < 50) return `At least 50 characters required (${v.trim().length}/50)`;
    if (v.trim().length > 1000) return 'Keep it under 1000 characters';
    if (!isMeaningfulText(v, 6)) return 'Please write a real description of your mission — avoid random characters or repetition';
    return null;
  },

  contactName: v => {
    if (!v.trim()) return 'Contact person name is required';
    if (!isValidName(v)) return 'Please enter a real person name';
    if (!/^[a-zA-Z\s.'-]+$/.test(v.trim())) return 'Name should contain only letters';
    return null;
  },

  contactPhone: v => {
    const d = v.replace(/\D/g, '');
    if (!d) return 'Phone number is required';
    if (d.length !== 10) return 'Enter a valid 10-digit Indian mobile number';
    if (!/^[6-9]/.test(d)) return 'Indian mobile numbers start with 6, 7, 8, or 9';
    return null;
  },
};

/* ─── format checks for risk score ──────────────────── */
function runFormatChecks(form) {
  const checks = [];
  const pan = (form.panNumber || '').trim().toUpperCase();
  checks.push({ label:'PAN format',          pass:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan), detail: pan || 'Not provided' });
  checks.push({ label:'Registration number', pass:(form.regNumber || '').trim().length >= 5, detail: form.regNumber || 'Not provided' });
  checks.push({ label:'Phone number',        pass:/^[6-9]\d{9}$/.test(form.contactPhone.replace(/\D/g,'')), detail: form.contactPhone || 'Not provided' });
  checks.push({ label:'Website provided',    pass: !!form.website.trim(), detail: form.website || 'No website' });
  checks.push({ label:'Year established',    pass: !!form.yearEstablished && parseInt(form.yearEstablished) >= 1950, detail: form.yearEstablished ? `Est. ${form.yearEstablished}` : 'Not provided' });
  checks.push({ label:'Description quality', pass: isMeaningfulText(form.description, 6), detail: form.description.length >= 50 ? 'Sufficient' : 'Too short' });
  const score = Math.round((checks.filter(c => c.pass).length / checks.length) * 100);
  return { checks, score };
}

/* ─── risk score: AI confidence is the primary gate ─── */
function calculateRiskScore(formatScore, aiResult) {
  const aiConfidence = typeof aiResult?.confidence_score === 'number'
    ? Math.max(0, Math.min(100, aiResult.confidence_score)) : 0;
  const formatBonus = aiConfidence >= 65 ? Math.round(formatScore * 0.10) : 0;
  const total = Math.min(100, aiConfidence + formatBonus);
  return {
    total,
    breakdown: { aiConfidence, formatBonus, documentClassification: aiResult?.document_classification || 'unknown', decision: aiResult?.decision || (total >= 65 ? 'manual_review' : 'reject') },
    level: total >= 65 ? 'MEDIUM' : 'HIGH',
  };
}

/* ─── AI verification — strict deduction prompt ──────── */
async function verifyOrgWithAI(form, imgBase64, imgType) {
  if (!imgBase64) {
    return {
      document_classification:'no_image', confidence_score:0, decision:'reject',
      matched_fields:{ organization_name:false, registration_number:false, location:false, purpose:false },
      extracted_text_summary:'No image — PDF or missing file.',
      red_flags:['Registration certificate uploaded as PDF — AI requires JPG/PNG image','Upload a clear photo of your registration certificate as JPG or PNG'],
      reasoning:'No image available for analysis. Score 0. Auto-rejected.',
      extractedOrgName:null, extractedRegNumber:null, extractedAuthority:null, extractedDate:null,
      nameMatch:false, regNumberMatch:false, documentAuthenticityScore:0,
      documentType:'No image', redFlags:['PDF uploaded — re-upload as JPG/PNG'], summary:'No image. Score 0.',
    };
  }

  const prompt = `You are a STRICT NGO document verification engine for TransparentFund, an Indian donation platform.

YOUR MANDATE: Protect donors from fraud. Reject anything that is not a genuine, readable Indian NGO/Trust/Society/Section-8 registration certificate. Do NOT be generous.

DECLARED REGISTRATION FORM:
- Organisation Name: "${form.orgName}"
- Registration Number: "${form.regNumber}"
- PAN: "${form.panNumber}"
- Type: "${form.orgType}"
- City: "${form.city}", State: "${form.state}"
- Year Established: "${form.yearEstablished || 'not provided'}"
- Mission: "${form.description.slice(0, 200)}"

EXPECTED DOCUMENT: Indian NGO registration certificate (Society Reg. Act, Trust deed, Section-8 company cert, or equivalent)

═══════════════════════════════════════════
CLASSIFICATION — PICK EXACTLY ONE:
═══════════════════════════════════════════
correct_document   — IS a genuine registration/incorporation certificate for an Indian NGO/Trust/Society
wrong_document     — a real document but NOT a registration certificate (PAN card, bank statement, Aadhaar, invoice, 80G cert)
unrelated_image    — a photo, product image, random picture, nature shot, person photo, not a document
code_image         — screenshot of code, IDE, terminal, GitHub, programming content
screenshot         — screenshot of a website, app UI, phone screen, digital interface
blank              — blank, all-white, all-black, corrupted, or completely unreadable

═══════════════════════════════════════════
SCORING — START FROM 100, DEDUCT:
═══════════════════════════════════════════
wrong_document:   -80 (max score 20)
unrelated_image:  -95 (max score 5)
code_image:       -95 (max score 5)
screenshot:       -90 (max score 10)
blank:            -100 (score = 0)
Unreadable text:  -40
Name mismatch:    -25
Reg# mismatch:    -35
Suspicious edits (pasted text, mixed fonts): -40
AI-generated artifacts: -45
No official seal or authority: -30
Date is impossible: -20

HARD CAPS (enforce these regardless of other factors):
  code_image / unrelated_image: confidence_score MUST be ≤ 5
  screenshot: confidence_score MUST be ≤ 10
  wrong_document: confidence_score MUST be ≤ 20
  blank: confidence_score = 0
  correct_document with good match: score 70-92

Return ONLY valid JSON, no markdown, no extra text:
{
  "document_classification": "<correct_document|wrong_document|unrelated_image|code_image|screenshot|blank>",
  "confidence_score": <integer 0-100>,
  "decision": "<reject|manual_review>",
  "matched_fields": {
    "organization_name": <true|false|null>,
    "registration_number": <true|false|null>,
    "location": <true|false|null>,
    "purpose": <true|false|null>
  },
  "extracted_text_summary": "<key text found, or reason why nothing was extracted>",
  "red_flags": ["<specific red flag>"],
  "reasoning": "<2-3 sentences: what you see, why you classified it this way, and why this score>",
  "extractedOrgName": "<org name in document or null>",
  "extractedRegNumber": "<reg number in document or null>",
  "extractedAuthority": "<issuing body or null>",
  "extractedDate": "<registration date or null>",
  "nameMatch": <true|false|null>,
  "regNumberMatch": <true|false|null>,
  "documentAuthenticityScore": <same value as confidence_score>,
  "documentType": "<human-readable document type>",
  "redFlags": ["<same as red_flags array>"],
  "summary": "<one sentence version of reasoning>"
}`;

  try {
    const res = await fetch('http://localhost:5000/api/ai/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:900,
        messages:[{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:imgType, data:imgBase64 } },
          { type:'text',  text:prompt },
        ]}],
      }),
    });
    const data   = await res.json();
    const raw    = data.content?.[0]?.text ?? '';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    // Hard-enforce score caps in JS — model cannot override these
    const caps = { code_image:5, unrelated_image:5, screenshot:10, wrong_document:20, blank:0 };
    const cls  = parsed.document_classification || '';
    if (caps[cls] !== undefined) {
      parsed.confidence_score          = Math.min(parsed.confidence_score ?? 0, caps[cls]);
      parsed.documentAuthenticityScore = parsed.confidence_score;
    }
    parsed.confidence_score          = Math.max(0, Math.min(100, parsed.confidence_score ?? 0));
    parsed.documentAuthenticityScore = parsed.confidence_score;
    parsed.decision = parsed.confidence_score >= 65 ? 'manual_review' : 'reject';
    return parsed;
  } catch {
    return {
      document_classification:'api_error', confidence_score:0, decision:'reject',
      matched_fields:{ organization_name:null, registration_number:null, location:null, purpose:null },
      extracted_text_summary:'AI service unavailable.',
      red_flags:['AI verification service error — admin must manually verify'],
      reasoning:'AI verification failed. Score 0. Admin must manually verify all documents.',
      extractedOrgName:null, extractedRegNumber:null, extractedAuthority:null, extractedDate:null,
      nameMatch:null, regNumberMatch:null, documentAuthenticityScore:0,
      documentType:'AI error', redFlags:['AI verification failed'], summary:'AI error. Score 0.',
    };
  }
}

/* ─── derive smart rejection reasons ─────────────────── */
function deriveRejectionReasons(aiResult, formatResult, form) {
  const reasons = [];
  const cls = aiResult?.document_classification;

  if (cls === 'code_image')      reasons.push({ icon:'💻', msg:'Uploaded file appears to be a code screenshot — upload a registration certificate' });
  if (cls === 'unrelated_image') reasons.push({ icon:'🖼️', msg:'Uploaded image is not a document — it appears to be an unrelated photo or image' });
  if (cls === 'screenshot')      reasons.push({ icon:'📱', msg:'Uploaded file is a screenshot — upload a clear photo or scan of the original certificate' });
  if (cls === 'wrong_document')  reasons.push({ icon:'📄', msg:'Uploaded document is not a registration certificate — check you uploaded the correct file' });
  if (cls === 'blank')           reasons.push({ icon:'⬜', msg:'Uploaded image is blank or unreadable — ensure the document is clearly photographed' });
  if (cls === 'no_image')        reasons.push({ icon:'📎', msg:'Registration certificate was uploaded as a PDF — AI requires JPG or PNG image format' });
  if (cls === 'api_error')       reasons.push({ icon:'⚠️', msg:'AI verification service was unavailable — please try again in a moment' });

  if (cls === 'correct_document') {
    if (aiResult?.nameMatch === false)      reasons.push({ icon:'🏷️', msg:`Organisation name on certificate does not match what you declared ("${form.orgName}")` });
    if (aiResult?.regNumberMatch === false) reasons.push({ icon:'🔢', msg:`Registration number on certificate does not match ("${form.regNumber}")` });
    if (aiResult?.matched_fields?.location === false) reasons.push({ icon:'📍', msg:'City/State on document does not match your declared location' });
  }

  // Format issues
  const failedFormats = (formatResult?.checks || []).filter(c => !c.pass);
  if (failedFormats.some(f => f.label === 'Description quality')) reasons.push({ icon:'📝', msg:'Mission description appears to contain meaningless or repeated text — write a genuine description' });

  // Red flags from AI
  if (aiResult?.red_flags?.length > 0 && cls === 'correct_document') {
    aiResult.red_flags.slice(0, 2).forEach(f => reasons.push({ icon:'⚠️', msg:f }));
  }

  // Default if nothing specific
  if (reasons.length === 0) reasons.push({ icon:'❌', msg:'AI verification score below minimum threshold (65%) — ensure all documents are clear and correctly uploaded' });

  return reasons;
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
      if (width > IMG_MAX_PX || height > IMG_MAX_PX) { const r = Math.min(IMG_MAX_PX/width, IMG_MAX_PX/height); width = Math.round(width*r); height = Math.round(height*r); }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type:'image/jpeg' })), 'image/jpeg', IMG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ─── Cloudinary upload ──────────────────────────────── */
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', 'ngoRequests');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded/e.total)*100)); };
    xhr.onload = () => {
      try { const r = JSON.parse(xhr.responseText); if (xhr.status===200) resolve(r.secure_url); else reject(new Error(r.error?.message||'Upload failed')); }
      catch { reject(new Error('Invalid Cloudinary response')); }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

/* ─── styles ──────────────────────────────────────────── */
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

/* ─── FILE FIELD — image-only enforced ──────────────── */
const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/webp'];

function FileField({ docDef, value, error, onChange }) {
  const ref   = useRef();
  const valid = value && !error;
  const bc    = error ? 'rgba(239,68,68,0.6)' : valid ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.12)';

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Hard reject non-image files
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      onChange(docDef.key, null, 'Only JPG, PNG, or WEBP images are accepted — PDF and other formats are rejected');
      return;
    }
    onChange(docDef.key, file, null);
  };

  return (
    <div>
      <label style={LABEL}>
        {docDef.label}
        {docDef.required ? <span style={{ color:'#f87171', marginLeft:'4px' }}>*</span>
          : <span style={{ color:'rgba(255,255,255,0.25)', marginLeft:'6px', fontSize:'11px' }}>(optional)</span>}
      </label>
      <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.28)', marginBottom:'6px' }}>{docDef.hint}</div>
      <div onClick={() => ref.current.click()} style={{ ...INPUT_BASE, cursor:'pointer', border:`1px solid ${bc}`, display:'flex', alignItems:'center', gap:'10px', justifyContent:'space-between' }}>
        <input ref={ref} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display:'none' }} onChange={handleChange} />
        <span style={{ color: valid ? '#c4b5fd' : error ? '#fca5a5' : 'rgba(255,255,255,0.3)', fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {error ? `⚠ ${error}` : valid ? `✓ ${value.name}` : 'Click to upload — JPG, PNG or WEBP images only'}
        </span>
        <span style={{ padding:'4px 12px', borderRadius:'6px', fontSize:'11px', fontWeight:700, flexShrink:0, background: valid ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.07)', color: valid ? '#c4b5fd' : 'rgba(255,255,255,0.4)', border:`1px solid ${valid ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
          {valid ? 'Change' : 'Browse'}
        </span>
      </div>
      {value && !error && (
        <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.25)', marginTop:'4px' }}>
          {(value.size/1024/1024).toFixed(2)} MB · will be compressed if large
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

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function NgoDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [status,       setStatus]       = useState('loading');
  const [showPopup,    setShowPopup]    = useState(false);
  const [campaigns,    setCampaigns]    = useState([]);
  const [totalRaised,  setTotalRaised]  = useState(0);
  const [rejectionReasons, setRejectionReasons] = useState([]);

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

  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => ({ ...t, [k]: true })); };
  const getError = k => VALIDATORS[k] ? VALIDATORS[k](form[k]) : null;

  const handleDocChange = (key, file, forceErr = null) => {
    if (forceErr) { setDocErrors(e => ({ ...e, [key]: forceErr })); setDocFiles(d => ({ ...d, [key]: null })); return; }
    if (!file) return;
    const sizeErr = file.size > MAX_BYTES ? `Too large (max ${MAX_MB} MB)` : null;
    setDocErrors(e => ({ ...e, [key]: sizeErr }));
    setDocFiles(d => ({ ...d, [key]: sizeErr ? null : file }));
  };

  /* ── load status ── */
  useEffect(() => {
    if (!user) return;
    if (role === 'admin') { navigate('/admin', { replace:true }); return; }

    if (role === 'ngo') {
      (async () => {
        const snap = await getDocs(query(collection(db,'ngoRequests'), where('uid','==',user.uid), limit(5)));
        const hasApproved = snap.docs.some(d => d.data()?.status === 'approved');
        if (hasApproved) {
          setStatus('approved');
          const key = `ngo_approved_seen_${user.uid}`;
          if (!localStorage.getItem(key)) { setShowPopup(true); localStorage.setItem(key,'1'); }
          getDocs(query(collection(db,'campaigns'), where('ngoId','==',user.uid))).then(s => {
            const list = s.docs.map(d => ({ id:d.id, ...d.data() }));
            setCampaigns(list);
            setTotalRaised(list.reduce((sum,c) => sum+(c.raisedAmount||0), 0));
          });
        } else if (snap.empty) { setStatus('none'); }
        else {
          const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
          items.sort((a,b) => (b.createdAt?.seconds??0)-(a.createdAt?.seconds??0));
          setStatus(items[0].status || 'pending');
        }
      })();
      return;
    }

    (async () => {
      const snap = await getDocs(query(collection(db,'ngoRequests'), where('uid','==',user.uid), limit(5)));
      if (snap.empty) { setStatus('none'); return; }
      const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      items.sort((a,b) => (b.createdAt?.seconds??0)-(a.createdAt?.seconds??0));
      setStatus(items[0].status || 'pending');
    })();
  }, [user, role]);

  /* ── submit ── */
  const handleSubmit = async () => {
    const allKeys = Object.keys(VALIDATORS);
    setTouched(allKeys.reduce((acc,k) => ({ ...acc, [k]:true }), {}));
    const fieldErrors = allKeys.map(k => VALIDATORS[k](form[k])).filter(Boolean);
    if (fieldErrors.length) {
      document.querySelector('[data-form-top]')?.scrollIntoView({ behavior:'smooth' });
      return;
    }

    const missingDocs = REQUIRED_DOCS.filter(d => d.required && !docFiles[d.key]);
    if (missingDocs.length) { alert(`Please upload: ${missingDocs.map(d => d.label).join(', ')}`); return; }
    if (Object.values(docErrors).some(Boolean)) { alert('Please fix file errors first.'); return; }

    // Normalize website URL
    if (form.website && !form.website.startsWith('http')) {
      setForm(f => ({ ...f, website:'https://'+f.website }));
    }

    /* Phase 1: Upload */
    setUploading(true);
    const filesToUpload = REQUIRED_DOCS.filter(d => docFiles[d.key]);
    setTotalFiles(filesToUpload.length); setDoneFiles(0);

    const urls = {};
    let regCertBase64 = null, regCertType = null;

    try {
      let done = 0;
      for (const docDef of filesToUpload) {
        setUploadLabel(docDef.label); setUploadPct(0);
        const raw        = docFiles[docDef.key];
        const compressed = await compressImage(raw);
        if (docDef.key === 'regCertificate') {
          await new Promise(res => {
            const reader = new FileReader();
            reader.onload = e => { regCertBase64 = e.target.result.split(',')[1]; regCertType = raw.type; res(); };
            reader.readAsDataURL(compressed);
          });
        }
        urls[docDef.key] = await uploadToCloudinary(compressed, pct => setUploadPct(pct));
        done++; setDoneFiles(done);
      }
    } catch (e) { alert('Upload failed: '+e.message); setUploading(false); return; }
    setUploading(false);

    /* Phase 2: Verify */
    setVerifying(true);
    setVerifyLabel('Validating format checks…'); setVerifyStep(1);
    const formatResult = runFormatChecks(form);
    await new Promise(r => setTimeout(r, 400));

    setVerifyLabel('Running AI document analysis…'); setVerifyStep(2);
    const aiResult = await verifyOrgWithAI(form, regCertBase64, regCertType);

    setVerifyLabel('Cross-checking consistency…'); setVerifyStep(3);
    await new Promise(r => setTimeout(r, 300));

    setVerifyLabel('Calculating risk score…'); setVerifyStep(4);
    const riskScore = calculateRiskScore(formatResult.score, aiResult);
    await new Promise(r => setTimeout(r, 200));

    setVerifyLabel('Saving registration…'); setVerifyStep(5);

    const finalStatus = riskScore.total >= 65 ? 'pending' : 'rejected';

    // Compute smart rejection reasons before saving
    if (finalStatus === 'rejected') {
      setRejectionReasons(deriveRejectionReasons(aiResult, formatResult, form));
    }

    try {
      await addDoc(collection(db,'ngoRequests'), {
        uid:user.uid, email:user.email||'', name:user.displayName||'', photoURL:user.photoURL||'',
        status:finalStatus,
        ...form,
        documents:urls,
        aiVerification:{
          formatChecks:    formatResult.checks,
          formatScore:     formatResult.score,
          aiExtracted:{
            orgName:      aiResult.extractedOrgName ?? null,
            regNumber:    aiResult.extractedRegNumber ?? null,
            authority:    aiResult.extractedAuthority ?? null,
            registeredOn: aiResult.extractedDate ?? null,
            documentType: aiResult.document_classification || aiResult.documentType || null,
          },
          aiScore:                aiResult.confidence_score??aiResult.documentAuthenticityScore??0,
          documentClassification: aiResult.document_classification||'unknown',
          aiDecision:             aiResult.decision||'reject',
          matchedFields:          aiResult.matched_fields||{},
          extractedTextSummary:   aiResult.extracted_text_summary||'',
          reasoning:              aiResult.reasoning||aiResult.summary||'',
          nameMatch:              aiResult.nameMatch??aiResult.matched_fields?.organization_name??null,
          regMatch:               aiResult.regNumberMatch??aiResult.matched_fields?.registration_number??null,
          redFlags:               aiResult.red_flags||aiResult.redFlags||[],
          aiSummary:              aiResult.reasoning||aiResult.summary||'',
          riskScore:              riskScore.total,
          riskLevel:              riskScore.level,
          scoreBreakdown:         riskScore.breakdown,
          verifiedAt:             new Date().toISOString(),
        },
        createdAt:serverTimestamp(),
      });
      setStatus(finalStatus);
    } catch (e) {
      alert('Submission failed: '+e.message);
    } finally {
      setVerifying(false);
    }
  };

  /* ── States ── */
  if (status === 'loading') return <div style={{ padding:'80px 48px', color:'rgba(255,255,255,0.35)', fontSize:'14px' }}>Loading…</div>;

  if (status === 'approved') return (
    <>
      {showPopup && <ApprovalPopup onClose={() => setShowPopup(false)} />}
      <div style={{ padding:'40px 48px', maxWidth:'900px' }}>
        <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#10b981', marginBottom:'8px' }}>NGO Dashboard</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'30px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>
          Welcome, {user?.displayName?.split(' ')[0]||'Organisation'}
        </h2>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'36px' }}>Manage campaigns, upload milestone proofs, and track fund releases.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'28px' }}>
          {[
            { label:'Active campaigns', val:campaigns.filter(c=>c.status==='active').length.toString(), color:'#a78bfa' },
            { label:'Total raised',     val:`₹${totalRaised.toLocaleString('en-IN')}`,                  color:'#22d3ee' },
            { label:'Total donors',     val:campaigns.reduce((s,c)=>s+(c.donorCount||0),0).toString(),  color:'#34d399' },
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
              const raised=c.raisedAmount||0, target=c.targetAmount||0;
              const pct=target?Math.min(Math.round((raised/target)*100),100):0;
              return (
                <div key={c.id} style={{ padding:'16px 24px', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', gap:'16px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', fontWeight:600, color:'#fff', marginBottom:'6px' }}>{c.title}</div>
                    <div style={{ height:'4px', borderRadius:'4px', background:'rgba(255,255,255,0.08)', overflow:'hidden', marginBottom:'4px' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#7c3aed,#0891b2)', borderRadius:'4px' }} />
                    </div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>₹{Math.max(0,target-raised).toLocaleString('en-IN')} remaining of ₹{target.toLocaleString('en-IN')}</div>
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
          AI verification passed ✅ Your application is with an admin who will review within 1–2 business days.
        </p>
        <div style={{ padding:'12px 16px', borderRadius:'10px', marginBottom:'24px', border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.1)', fontSize:'13px', color:'#fcd34d', lineHeight:1.6 }}>
          💡 After approval, sign out and sign back in to unlock the full NGO dashboard.
        </div>
        <Link to="/" style={{ display:'inline-block', padding:'11px 28px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px', textDecoration:'none' }}>← Back to home</Link>
      </div>
    </div>
  );

  /* ── SMART REJECTION SCREEN ── */
  if (status === 'rejected') return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px' }}>
      <div style={{ width:'100%', maxWidth:'560px', padding:'40px', borderRadius:'20px', border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.05)' }}>
        <div style={{ textAlign:'center', marginBottom:'24px' }}>
          <div style={{ fontSize:'52px', marginBottom:'16px' }}>❌</div>
          <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:'#fff', marginBottom:'8px' }}>Verification Failed</h2>
          <p style={{ color:'rgba(255,255,255,0.45)', fontSize:'14px' }}>AI could not verify your registration. Here's exactly why:</p>
        </div>

        {/* Show only triggered rejection reasons */}
        {rejectionReasons.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'24px' }}>
            {rejectionReasons.map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'14px 16px', borderRadius:'12px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)' }}>
                <span style={{ fontSize:'18px', flexShrink:0 }}>{r.icon}</span>
                <span style={{ fontSize:'13px', color:'#fca5a5', lineHeight:1.6 }}>{r.msg}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding:'14px 16px', borderRadius:'12px', marginBottom:'24px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', fontSize:'13px', color:'#fca5a5', lineHeight:1.8 }}>
            AI verification score below 65% threshold. Please ensure documents are clear and match declared information.
          </div>
        )}

        <div style={{ padding:'12px 16px', borderRadius:'10px', marginBottom:'24px', border:'1px solid rgba(245,158,11,0.25)', background:'rgba(245,158,11,0.07)', fontSize:'13px', color:'#fcd34d', lineHeight:1.7 }}>
          ⚡ <strong>Quick fix:</strong> Upload the Registration Certificate as a clear JPG or PNG photo — not PDF. Make sure the organisation name and registration number are clearly readable.
        </div>

        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <button onClick={() => { setStatus('none'); setRejectionReasons([]); }} style={{ padding:'11px 24px', borderRadius:'10px', border:'none', background:'#7c3aed', color:'#fff', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>Try Again</button>
          <Link to="/" style={{ display:'inline-block', padding:'11px 24px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px', textDecoration:'none' }}>← Home</Link>
        </div>
      </div>
    </div>
  );

  /* ── REGISTRATION FORM ── */
  const VERIFY_STEPS = ['Uploading documents','Format validation','AI document analysis','Consistency check','Risk scoring','Saving'];

  return (
    <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'48px 16px 80px' }}>
      <div style={{ width:'100%', maxWidth:'720px' }} data-form-top>
        <Link to="/" style={{ display:'inline-flex', alignItems:'center', gap:'6px', color:'rgba(255,255,255,0.35)', fontSize:'13px', textDecoration:'none', marginBottom:'28px' }}>← Back to home</Link>
        <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#22d3ee', marginBottom:'8px' }}>Organisation Registration</div>
        <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'28px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>Register your organisation</h2>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'24px', lineHeight:1.6 }}>
          Fill in all details accurately. AI will verify your registration certificate image.
        </p>

        {/* Key warning */}
        <div style={{ padding:'14px 18px', borderRadius:'12px', marginBottom:'24px', border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.07)', fontSize:'13px', color:'#fcd34d', lineHeight:1.7 }}>
          ⚠️ <strong>Images only (JPG/PNG/WEBP) — PDF files are rejected.</strong> Score ≥ 65 → Admin review. Score &lt; 65 → Auto-rejected with specific reasons.
        </div>

        <div style={{ borderRadius:'20px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'32px' }}>

          <div style={SEC}>Basic information</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Organisation name" required error={getError('orgName')} touched={touched.orgName}>
              <input value={form.orgName} onChange={e => setField('orgName',e.target.value)} onBlur={() => setTouched(t=>({...t,orgName:true}))} placeholder="e.g. Helping Hands Foundation" style={inp(getError('orgName'),touched.orgName)} />
            </Field>
            <Field label="Organisation type" required error={getError('orgType')} touched={touched.orgType}>
              <select value={form.orgType} onChange={e => setField('orgType',e.target.value)} style={{ ...inp(getError('orgType'),touched.orgType), WebkitAppearance:'none', cursor:'pointer' }}>
                <option value="" style={{ background:'#111827' }}>Select type…</option>
                {ORG_TYPES.map(t => <option key={t} value={t} style={{ background:'#111827' }}>{t}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Registration / Certificate number" required error={getError('regNumber')} touched={touched.regNumber} hint="Must match certificate exactly (e.g. MH/NGO/12345/2018)">
              <input value={form.regNumber} onChange={e => setField('regNumber',e.target.value)} onBlur={() => setTouched(t=>({...t,regNumber:true}))} placeholder="e.g. MH/NGO/12345/2018" style={inp(getError('regNumber'),touched.regNumber)} />
            </Field>
            <Field label="Organisation PAN" required error={getError('panNumber')} touched={touched.panNumber} hint="Format: ABCDE1234F">
              <input value={form.panNumber} onChange={e => setField('panNumber',e.target.value.toUpperCase().slice(0,10))} onBlur={() => setTouched(t=>({...t,panNumber:true}))} placeholder="AABCH1234C" maxLength={10} style={inp(getError('panNumber'),touched.panNumber)} />
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="City" required error={getError('city')} touched={touched.city}>
              <input value={form.city} onChange={e => setField('city',e.target.value)} onBlur={() => setTouched(t=>({...t,city:true}))} placeholder="e.g. Pune" style={inp(getError('city'),touched.city)} />
            </Field>
            <Field label="State" required error={getError('state')} touched={touched.state}>
              <select value={form.state} onChange={e => setField('state',e.target.value)} style={{ ...inp(getError('state'),touched.state), WebkitAppearance:'none', cursor:'pointer' }}>
                <option value="" style={{ background:'#111827' }}>Select state…</option>
                {INDIAN_STATES.map(s => <option key={s} value={s} style={{ background:'#111827' }}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <Field label="Year established" required error={getError('yearEstablished')} touched={touched.yearEstablished}>
              <input type="number" min="1950" max={new Date().getFullYear()} value={form.yearEstablished} onChange={e => setField('yearEstablished',e.target.value)} onBlur={() => setTouched(t=>({...t,yearEstablished:true}))} placeholder="e.g. 2015" style={inp(getError('yearEstablished'),touched.yearEstablished)} />
            </Field>
            <Field label="Website" required error={getError('website')} touched={touched.website} hint="Your organisation's official website">
              <input type="text" value={form.website} onChange={e => setField('website',e.target.value)} onBlur={() => setTouched(t=>({...t,website:true}))} placeholder="https://yourorg.org" style={inp(getError('website'),touched.website)} />
            </Field>
          </div>

          <div style={{ marginBottom:'28px' }}>
            <Field label="Mission & description" required error={getError('description')} touched={touched.description} hint={`${form.description.trim().length}/50 characters minimum · describe your real mission`}>
              <textarea rows={5} value={form.description} onChange={e => setField('description',e.target.value)} onBlur={() => setTouched(t=>({...t,description:true}))} placeholder="Describe your organisation's mission, what work you do, who you help, and why you need to raise funds…" style={{ ...inp(getError('description'),touched.description), resize:'vertical', lineHeight:1.65 }} />
            </Field>
          </div>

          <div style={SEC}>Contact details</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'28px' }}>
            <Field label="Contact person name" required error={getError('contactName')} touched={touched.contactName}>
              <input value={form.contactName} onChange={e => setField('contactName',e.target.value)} onBlur={() => setTouched(t=>({...t,contactName:true}))} placeholder="e.g. Priya Sharma" style={inp(getError('contactName'),touched.contactName)} />
            </Field>
            <Field label="Contact phone" required error={getError('contactPhone')} touched={touched.contactPhone} hint="10-digit Indian mobile">
              <input type="tel" maxLength={10} value={form.contactPhone} onChange={e => setField('contactPhone',e.target.value.replace(/\D/g,'').slice(0,10))} onBlur={() => setTouched(t=>({...t,contactPhone:true}))} placeholder="9876543210" style={inp(getError('contactPhone'),touched.contactPhone)} />
            </Field>
          </div>

          <div style={SEC}>Verification documents — JPG / PNG / WEBP only</div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.3)', marginBottom:'18px', lineHeight:1.7 }}>
            📸 Upload clear photos or scans as <strong style={{ color:'#fcd34d' }}>JPG, PNG or WEBP</strong>.<br />
            <strong style={{ color:'#f87171' }}>PDF files are rejected automatically.</strong> AI analyzes the registration certificate image to verify authenticity.<br />
            <span style={{ color:'#f87171' }}>*</span> = required.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'28px' }}>
            {REQUIRED_DOCS.map(d => <FileField key={d.key} docDef={d} value={docFiles[d.key]} error={docErrors[d.key]} onChange={handleDocChange} />)}
          </div>

          {/* Upload progress */}
          {uploading && (
            <div style={{ marginBottom:'20px', padding:'16px 18px', borderRadius:'14px', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#c4b5fd', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{uploadLabel}</div>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', flexShrink:0 }}>File {doneFiles+1} of {totalFiles}</div>
              </div>
              <div style={{ height:'6px', borderRadius:'6px', background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:'6px', background:'linear-gradient(90deg,#7c3aed,#0891b2)', width:`${Math.round((doneFiles/totalFiles)*100+uploadPct/totalFiles)}%`, transition:'width 0.2s' }} />
              </div>
            </div>
          )}

          {/* Verification progress */}
          {verifying && (
            <div style={{ marginBottom:'20px', padding:'18px 20px', borderRadius:'14px', border:'1px solid rgba(34,211,238,0.3)', background:'rgba(34,211,238,0.06)' }}>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#67e8f9', marginBottom:'14px' }}>🤖 {verifyLabel}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {VERIFY_STEPS.map((step,i) => {
                  const done=i<verifyStep, active=i===verifyStep-1;
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'12px' }}>
                      <div style={{ width:'20px', height:'20px', borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:700,
                        background: done?'rgba(16,185,129,0.3)':active?'rgba(34,211,238,0.3)':'rgba(255,255,255,0.06)',
                        border: done?'1px solid rgba(16,185,129,0.6)':active?'1px solid rgba(34,211,238,0.6)':'1px solid rgba(255,255,255,0.1)',
                        color: done?'#6ee7b7':active?'#67e8f9':'rgba(255,255,255,0.3)',
                      }}>{done?'✓':i+1}</div>
                      <span style={{ color:done?'#6ee7b7':active?'#67e8f9':'rgba(255,255,255,0.3)' }}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={uploading||verifying} style={{
            width:'100%', padding:'15px', borderRadius:'12px', border:'none',
            background: uploading||verifying ? 'rgba(8,145,178,0.4)' : 'linear-gradient(135deg,#0891b2,#7c3aed)',
            color:'#fff', fontWeight:700, fontSize:'15px',
            cursor: uploading||verifying ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          }}>
            {uploading||verifying
              ? <><span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />{verifying?verifyLabel:'Uploading…'}</>
              : 'Submit Registration for Verification & Admin Review'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}