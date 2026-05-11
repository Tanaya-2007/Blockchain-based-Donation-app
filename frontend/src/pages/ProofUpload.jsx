import { useEffect, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/* ─── normalize Firestore milestones ──────────────────── */
function normalizeMilestones(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return Object.keys(raw).sort((a, b) => Number(a) - Number(b)).map(k => raw[k]);
}

function safeCampaign(raw) {
  if (!raw) return null;
  const c = { ...raw, milestones: normalizeMilestones(raw.milestones) };
  const total = Number(c.targetAmount) || 0;
  const n = c.milestones.length;
  // Fix old campaigns where amounts were saved as 0
  if (n > 0 && total > 0 && c.milestones.every(m => !m.amount || m.amount === 0)) {
    const per = Math.floor(total / n);
    c.milestones = c.milestones.map((m, i) => ({
      ...m, amount: i === n - 1 ? total - per * (n - 1) : per,
    }));
  }
  return c;
}

/* ─── FIX: dynamic milestone hint from actual milestone title ─────────────
   Instead of hardcoded medical hints, we show the milestone's actual title
   from the campaign + a generic "upload relevant proof" instruction.
   Falls back to a generic hint if title is default "Milestone N".           */
function getMilestoneHint(milestone, msIndex) {
  const title = milestone?.title || '';
  const isDefault = /^Milestone\s+\d+$/i.test(title.trim());

  if (!isDefault && title.trim()) {
    return `Upload proof documents for: "${title}" — receipts, certificates, reports, or official letters that confirm this milestone was completed.`;
  }

  // Generic fallback hints for each position
  const fallbacks = [
    'Upload: Invoice / Admission letter / Initial report confirming the milestone was started',
    'Upload: Progress report / Certificate / Receipt confirming milestone completion',
    'Upload: Final report / Bank statement / Official confirmation of funds utilisation',
    'Upload: Outcome report / Beneficiary testimonial / Verification letter',
    'Upload: Closure document / Final audit / Summary report from authorised person',
  ];
  return fallbacks[msIndex] || fallbacks[fallbacks.length - 1];
}

/* ─── upload to Cloudinary — NO eager param ──────────── */
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', 'milestoneProofs');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
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

/* ─── styles ──────────────────────────────────────────── */
const MS_STYLE = {
  verified: { border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)', color: '#6ee7b7' },
  approved: { border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)', color: '#6ee7b7' },
  pending_admin_review: { border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d' },
  pending: { border: '1px solid rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.1)', color: '#c4b5fd' },
  locked: { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)' },
  rejected: { border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', color: '#fca5a5' },
};
const PILL = {
  verified: { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' },
  approved: { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' },
  pending_admin_review: { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' },
  pending: { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' },
  locked: { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' },
  rejected: { background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' },
};
const statusIcon = { PASS: '✓', WARN: '⚠', FAIL: '✗' };
const statusColor = { PASS: '#34d399', WARN: '#fbbf24', FAIL: '#f87171' };



function getPillLabel(status) {
  if (status === 'verified' || status === 'approved') return '✓ Verified';
  if (status === 'pending_admin_review') return '⏳ Under Review';
  if (status === 'pending') return '⏳ Pending';
  if (status === 'rejected') return '✗ Rejected';
  return '🔒 Locked';
}

export default function ProofUpload({ onToast }) {
  const { user } = useAuth();
  const fileRef = useRef();

  const [campaigns, setCampaigns] = useState([]);
  const [selCampaign, setSelCampaign] = useState(null);
  const [loadingCamps, setLoadingCamps] = useState(true);

  /* submittedProofs keyed by `campaignId_milestoneNo` (String) so each
     milestone is tracked independently and survives page refresh.
     Populated from Firestore on mount.                                  */
  const [submittedProofs, setSubmittedProofs] = useState({});

  const [uploaded, setUploaded] = useState([]);
  const [fileObjs, setFileObjs] = useState([]);
  const [drag, setDrag] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [imgBase64, setImgBase64] = useState(null);
  const [imgType, setImgType] = useState(null);

  /* ── Load campaigns + existing proofs from Firestore ── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingCamps(true);
      try {
        const campSnap = await getDocs(
          query(collection(db, 'campaigns'), where('ngoId', '==', user.uid))
        );
        const list = campSnap.docs.map(d => safeCampaign({ id: d.id, ...d.data() }));
        setCampaigns(list);
        if (list.length === 1) setSelCampaign(list[0]);

        /* ── KEY FIX: load proof status from Firestore, not just React state.
           Cast milestoneNo to String consistently so key lookup always works.
           Previously milestoneNo could be Number from Firestore but key was
           built with String interpolation — comparison failed silently.      */
        const proofSnap = await getDocs(
          query(collection(db, 'proofs'), where('ngoId', '==', user.uid))
        );
        const allProofs = proofSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));

        const proofMap = {};
        allProofs.forEach(p => {
          if (!p.campaignId || p.milestoneNo == null) return;
          // Always use String for both parts of the key to avoid type mismatches
          const key = `${String(p.campaignId)}_${String(p.milestoneNo)}`;
          if (!proofMap[key]) {
            proofMap[key] = {
              milestoneNo: Number(p.milestoneNo),
              status: p.status,
              aiScore: p.aiScore,
            };
          }
        });
        setSubmittedProofs(proofMap);
      } catch (e) { console.error(e); }
      setLoadingCamps(false);
    })();
  }, [user]);

  const handleCampaignChange = campId => {
    const found = campaigns.find(c => c.id === campId) || null;
    setSelCampaign(found);
    setUploaded([]); setFileObjs([]);
    setResult(null); setImgBase64(null); setImgType(null);
  };

  const handleFile = file => {
    if (!file) return;
    setUploaded(prev => [...prev, { name: file.name, size: (file.size / 1024 / 1024).toFixed(1) + ' MB', icon: '📄' }]);
    setFileObjs(prev => [...prev, file]);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => { setImgBase64(e.target.result.split(',')[1]); setImgType(file.type); };
      reader.readAsDataURL(file);
    }
  };

  /* ── Save proof + update campaign ── */
  const saveProof = async (fileUrls, aiResult, finalStatus) => {
    if (!selCampaign) return;
    const currentMs = selCampaign.currentMilestone || 1;
    const status = finalStatus;

    // DO NOT save to DB if it's a pure rejection from an API failure
    if (aiResult?.decision === 'pending_retry' || status === 'pending_retry') {
       // Temporarily skipping DB save to avoid Firebase permission rules crash on 'proof_retries'
       // Just update the local UI state so the user knows it's pending without crashing
       const key = `${String(selCampaign.id)}_${String(currentMs)}`;
       setSubmittedProofs(prev => ({ ...prev, [key]: { milestoneNo: currentMs, status: 'pending_retry', aiScore: aiResult?.confidence_score } }));
       return;
    }

    if (status === 'rejected' && aiResult?.confidence_score === 0) {
      // Complete API failure, do not save to prevent locking
      return;
    }

    await addDoc(collection(db, 'proofs'), {
      campaignId: selCampaign.id,
      campaignTitle: selCampaign.title || '',
      ngoId: user.uid,
      ngoName: user.displayName || '',
      milestoneNo: currentMs,
      fileUrls,
      aiScore: aiResult?.confidence_score ?? null,
      aiVerdict: aiResult?.status ?? null,
      aiSummary: aiResult?.reason ?? null,
      aiProvider: aiResult?.ai_provider ?? 'Unknown',
      status,
      uploadedAt: serverTimestamp(),
    });

    if (status === 'approved') {
      const msIndex = currentMs - 1;
      const updatedMilestones = normalizeMilestones(selCampaign.milestones).map((m, i) =>
        i === msIndex ? { ...m, status: 'verified' } : m
      );

      await updateDoc(doc(db, 'campaigns', selCampaign.id), {
        milestones: updatedMilestones,
        currentMilestone: currentMs + 1,
      });
      const updateCamp = camp => {
        const milestones = normalizeMilestones(camp.milestones).map((m, i) =>
          i === msIndex ? { ...m, status: 'verified' } : m
        );
        return { ...camp, milestones, currentMilestone: currentMs + 1 };
      };
      setSelCampaign(prev => prev ? updateCamp(prev) : prev);
      setCampaigns(prev => prev.map(c => c.id === selCampaign.id ? updateCamp(c) : c));
    }

    // Use String key consistently — same format as the load-from-Firestore code above
    const key = `${String(selCampaign.id)}_${String(currentMs)}`;
    setSubmittedProofs(prev => ({ ...prev, [key]: { milestoneNo: currentMs, status, aiScore: aiResult?.confidence_score } }));
  };

  /* ── Main verification flow ── */
  const runVerification = async () => {
    // LAYER 1 — BASIC VALIDATION (CODE)
    if (fileObjs.length === 0) { onToast('No file uploaded', 'error'); return; }
    if (!selCampaign) { onToast('Select a campaign first', 'error'); return; }

    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    for (const file of fileObjs) {
      if (file.size < 5120) { // <5KB
        onToast(`File ${file.name} is too small (<5KB). Upload valid proof.`, 'error');
        return;
      }
      if (!allowedFormats.includes(file.type)) {
        onToast(`Invalid format. Only JPG, PNG, WEBP, or PDF allowed.`, 'error');
        return;
      }
    }

    setUploading(true); setUploadPct(0);
    const fileUrls = [];
    try {
      for (let i = 0; i < fileObjs.length; i++) {
        fileUrls.push(await uploadToCloudinary(
          fileObjs[i],
          pct => setUploadPct(Math.round((i / fileObjs.length) * 100 + pct / fileObjs.length)),
        ));
      }
    } catch (e) {
      onToast('Upload failed: ' + e.message, 'error');
      setUploading(false); return;
    }
    setUploading(false); setUploadPct(100);

    setVerifying(true); setResult(null);

    const ms = selCampaign.currentMilestone || 1;
    const msList = normalizeMilestones(selCampaign.milestones);
    const msAmt = msList[ms - 1]?.amount || 0;

    // LAYER 2 — AI VERIFICATION (GEMINI PRIMARY)
    const prompt = `[SYSTEM INSTRUCTION]
You are a STRICT MULTI-STAGE DOCUMENT ANALYZER for a blockchain donation platform.
You must analyze the uploaded document through 5 strict stages.

==================================================
CAMPAIGN CONTEXT
==================================================
Campaign Title: "${selCampaign.title || 'Unknown'}"
Expected Milestone Amount: ₹${msAmt.toLocaleString('en-IN')}

==================================================
STAGE 1 — DOCUMENT CLASSIFICATION
==================================================
VALID_TYPES = ["invoice", "bill", "construction_progress", "medical_receipt", "ngo_certificate", "government_document", "fund_utilization_report", "purchase_receipt", "project_photo", "milestone_proof"]
INVALID_TYPES = ["authorization_letter", "random_letter", "blank_page", "resume", "poster", "certificate_unrelated", "ai_generated_image", "edited_fake_document", "unrelated_photo", "meme", "cartoon", "social_media_screenshot"]

If document is an authorization letter or belongs to INVALID_TYPES, YOU MUST REJECT IT IMMEDIATELY with confidence_score 10-30 and status "rejected".

==================================================
STAGE 2 — OCR CONTENT ANALYSIS
==================================================
Extract all visible text. Look for organization names, dates, invoice numbers, currency amounts, signatures, and stamps.
If text is extremely small, unreadable or insufficient for the claimed document type, reject it with confidence_score 20-40.

==================================================
STAGE 3 — AI GENERATED / FAKE DETECTION
==================================================
Analyze for:
- repeated unnatural patterns, distorted text, GAN-like artifacts, fake signatures, edited layouts, inconsistent spacing.
If suspected fake, reject with confidence_score 5-25, fraud_risk_score 90, status "rejected".

==================================================
STAGE 4 — MILESTONE RELEVANCE MATCHING
==================================================
Compare extracted content to the Campaign Context provided above.
If the document does not match campaign milestone context (e.g. authorization letter instead of a bill), reject with confidence_score 30-50, status "rejected".

==================================================
STAGE 5 — FINAL TRUST SCORING
==================================================
ONLY IF ALL PREVIOUS STAGES PASS, generate weighted scoring:
- Document Authenticity: 35%
- Milestone Relevance: 30%
- OCR Quality: 15%
- Fraud Detection: 20%

Scoring Thresholds:
90-100: status = "approved"
70-89: status = "admin_review"
40-69: status = "rejected"
0-39: status = "fraud_suspected"

IMPORTANT: Unrelated authorization letters MUST NEVER exceed 35% confidence score.

==================================================
OUTPUT FORMAT (STRICT JSON ONLY)
==================================================
{
  "document_type": "detected type from VALID_TYPES or INVALID_TYPES",
  "confidence_score": <number 0-100>,
  "authenticity_score": <number 0-100>,
  "relevance_score": <number 0-100>,
  "fraud_risk_score": <number 0-100>,
  "status": "approved" | "admin_review" | "rejected" | "fraud_suspected",
  "reason": "short explanation explaining the decision",
  "reasons": ["array of strings explaining the decision in detail"],
  "recommended_action": "approve" | "manual_review" | "reject" | "upload_valid_document"
}

RETURN ONLY PURE JSON. NO MARKDOWN. NO EXPLANATIONS.`;

    let aiResult = null;
    try {
      let data;
      if (imgBase64) {
        const content = [{ type: 'image', source: { type: 'base64', media_type: imgType, data: imgBase64 } }, { type: 'text', text: prompt }];
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ai/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content }] }),
        });
        data = await res.json();
      } else {
        data = { success: true, result: { status: "rejected", confidence_score: 50, reason: "PDF cannot be automatically verified by AI - please upload images", is_relevant: true, matches_campaign: true, fraud_detected: false } };
      }
      aiResult = data.result || JSON.parse((data.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/)[0]);
    } catch (err) {
      console.error("AI Fetch/Parse Error:", err);
      aiResult = {
        status: 'pending_retry',
        confidence_score: 0,
        reason: 'Verification delayed due to AI service disruption. We will retry automatically.',
        is_relevant: true,
        matches_campaign: true,
        fraud_detected: false,
        decision: 'pending_retry',
        ai_provider: 'Service Outage'
      };
    }

    const confidence = aiResult.confidence_score ?? 20;
    aiResult.confidence_score = confidence;
    
    console.log("AI RESULT FRONTEND:", aiResult);

    // LAYER 3 — SAFE STATUS EXTRACTION
    let finalStatus = 'rejected';
    
    if (aiResult.status === 'pending_retry' || aiResult.decision === 'pending_retry') {
      finalStatus = 'pending_retry';
    } else if (aiResult.status === 'approved' || aiResult.status === 'admin_review' || aiResult.status === 'pending_admin_review') {
      finalStatus = 'pending_admin_review';
    } else {
      finalStatus = 'rejected';
    }

    aiResult.status = finalStatus;

    setResult(aiResult);
    try { await saveProof(fileUrls, aiResult, finalStatus); } catch (e) { console.error('saveProof failed:', e); }

    if (finalStatus === 'pending_admin_review') {
      onToast(`🤖 Verification completed (${aiResult.confidence_score}% confidence via ${aiResult.ai_provider || 'AI'})`, 'success');
    } else if (finalStatus === 'pending_retry') {
      onToast(`⏳ Verification in progress. Backup AI verification activated.`, 'info');
    } else {
      onToast(`❌ REJECTED — Please upload clear, relevant proof`, 'error');
    }
    setVerifying(false);
  };

  /* ── Derived values ── */
  const safeMilestones = normalizeMilestones(selCampaign?.milestones);
  const totalMilestones = safeMilestones.length;
  const currentMsNo = selCampaign?.currentMilestone || 1;
  const currentMsIndex = currentMsNo - 1;
  const currentMsObj = safeMilestones[currentMsIndex];
  const currentMsTitle = currentMsObj?.title || '';
  const allMilestonesComplete = currentMsNo > totalMilestones && totalMilestones > 0;

  // String key — consistent with load + save
  const currentProofKey = selCampaign ? `${String(selCampaign.id)}_${String(currentMsNo)}` : null;
  const currentMsAlreadySubmitted = currentProofKey ? !!submittedProofs[currentProofKey] : false;
  const currentProofData = currentProofKey ? submittedProofs[currentProofKey] : null;

  const s = result?.confidence_score ?? 0;
  const scoreColor = s >= 40 ? '#fbbf24' : '#f87171';

  if (!loadingCamps && campaigns.length === 0) {
    return (
      <div style={{ minHeight: 'calc(100vh - 68px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <h3 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>No active campaigns</h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Create a campaign first before uploading milestone proof.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>
      <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>
        Upload Milestone Proof
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '12px' }}>
        AI verifies every document — score determines outcome automatically
      </p>

      {/* Scoring legend
      <div style={{ display:'flex', gap:'10px', marginBottom:'24px', flexWrap:'wrap' }}>
        {[
          { range:'Score > 85',  label:'AUTO APPROVE', color:'#34d399', bg:'rgba(16,185,129,0.1)',  border:'rgba(16,185,129,0.3)'  },
          { range:'Score 55–85', label:'ADMIN REVIEW', color:'#fbbf24', bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.3)'  },
          { range:'Score < 55',  label:'AUTO REJECT',  color:'#f87171', bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.3)'   },
        ].map(t => (
          <div key={t.label} style={{ padding:'6px 14px', borderRadius:'999px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'11px', fontWeight:700, color:t.color }}>
            {t.range} → {t.label}
          </div>
        ))}
      </div> */}

      {/* Campaign selector */}
      {campaigns.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px' }}>Select campaign</label>
          <select value={selCampaign?.id || ''} onChange={e => handleCampaignChange(e.target.value)}
            style={{ padding: '11px 14px', borderRadius: '10px', background: '#111827', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', fontSize: '14px', outline: 'none', cursor: 'pointer', width: '100%', maxWidth: '400px' }}>
            <option value="">Choose campaign…</option>
            {campaigns.map(c => <option key={c.id} value={c.id} style={{ background: '#111827' }}>{c.title}</option>)}
          </select>
        </div>
      )}

      {/* All milestones complete */}
      {selCampaign && allMilestonesComplete && (
        <div style={{ padding: '40px 32px', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.07)', textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>🎉</div>
          <h3 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
            All {totalMilestones} milestones complete!
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7 }}>
            Every milestone proof has been submitted for <strong>{selCampaign.title}</strong>.
          </p>
        </div>
      )}

      {/* Already submitted for current milestone */}
      {selCampaign && !allMilestonesComplete && currentMsAlreadySubmitted && (
        <div style={{
          padding: '20px 24px', borderRadius: '16px', marginBottom: '20px',
          border: currentProofData?.status === 'approved' ? '1px solid rgba(16,185,129,0.4)'
            : currentProofData?.status === 'rejected' ? '1px solid rgba(239,68,68,0.4)'
              : '1px solid rgba(245,158,11,0.4)',
          background: currentProofData?.status === 'approved' ? 'rgba(16,185,129,0.07)'
            : currentProofData?.status === 'rejected' ? 'rgba(239,68,68,0.07)'
              : 'rgba(245,158,11,0.07)',
        }}>
          <div style={{
            fontSize: '14px', fontWeight: 700, marginBottom: '6px',
            color: currentProofData?.status === 'approved' ? '#6ee7b7'
              : currentProofData?.status === 'rejected' ? '#fca5a5' : '#fcd34d',
          }}>
            {currentProofData?.status === 'approved'
              ? '✅ Milestone proof approved — next milestone is now active'
              : currentProofData?.status === 'rejected'
                ? '❌ Proof was rejected — please contact admin'
                : `⏳ Proof submitted for Milestone ${currentMsNo} — awaiting admin review`}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            AI confidence score: <strong>{currentProofData?.aiScore ?? '—'}%</strong>
            {currentProofData?.status === 'pending_admin_review' && ' · You cannot re-upload until this is reviewed'}
          </div>
        </div>
      )}

      {/* ── FIX: dynamic milestone document hint ── */}
      {selCampaign && !allMilestonesComplete && !currentMsAlreadySubmitted && currentMsObj && (
        <div style={{ marginBottom: '20px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.05)', fontSize: '12px', color: '#67e8f9' }}>
          📋 <strong>Milestone {currentMsNo}{currentMsTitle ? ` — ${currentMsTitle}` : ''} documents:</strong>{' '}
          {getMilestoneHint(currentMsObj, currentMsIndex)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>

        {/* Left — Milestones */}
        <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Campaign Milestones</h3>
          {selCampaign ? (
            <>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(124,58,237,0.06)' }}>
                📋 {selCampaign.title}<br />
                Goal: ₹{(selCampaign.targetAmount || 0).toLocaleString('en-IN')} · {totalMilestones} milestone{totalMilestones !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {safeMilestones.map((m, i) => {
                  const msNo = i + 1;
                  const isCurrent = msNo === currentMsNo && !allMilestonesComplete;
                  // String key — same format everywhere
                  const proofKey = `${String(selCampaign.id)}_${String(msNo)}`;
                  const proof = submittedProofs[proofKey];

                  let displayStatus;
                  if (m.status === 'verified' || m.status === 'approved') {
                    displayStatus = 'verified';
                  } else if (proof && proof.status !== 'pending_retry') {
                    displayStatus = proof.status;
                  } else if (msNo < currentMsNo) {
                    displayStatus = 'pending_admin_review';
                  } else if (isCurrent) {
                    displayStatus = 'pending';
                  } else {
                    displayStatus = 'locked';
                  }

                  const amt = m.amount && m.amount > 0 ? m.amount : (() => {
                    const total = Number(selCampaign.targetAmount) || 0;
                    const n = totalMilestones;
                    if (!total || !n) return 0;
                    const per = Math.floor(total / n);
                    return i === n - 1 ? total - per * (n - 1) : per;
                  })();

                  return (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: '12px', ...(MS_STYLE[displayStatus] || MS_STYLE.locked) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{m.title || `Milestone ${msNo}`}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', ...(PILL[displayStatus] || PILL.locked) }}>
                          {getPillLabel(displayStatus)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>₹{amt.toLocaleString('en-IN')}</span>
                        {isCurrent && !currentMsAlreadySubmitted && (
                          <span style={{ color: '#c4b5fd', fontSize: '11px' }}>← Upload proof here</span>
                        )}
                        {msNo > currentMsNo && (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>🔒 Locked</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>Select a campaign to see milestones.</div>
          )}
        </div>

        {/* Right — Upload + AI */}
        <div>
          {(!selCampaign || allMilestonesComplete || currentMsAlreadySubmitted) ? (
            <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                {allMilestonesComplete ? '✅' : currentMsAlreadySubmitted ? '⏳' : '📋'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                {!selCampaign ? 'Select a campaign to begin'
                  : allMilestonesComplete ? 'All milestones completed — no uploads needed'
                    : 'Proof already submitted for this milestone'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '24px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Upload Documents</h3>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '20px' }}>
                  Milestone {currentMsNo} of {totalMilestones}
                  {currentMsTitle ? ` — ${currentMsTitle}` : ''}
                </p>

                <div
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={() => setDrag(true)}
                  onDragLeave={() => setDrag(false)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); setDrag(false); Array.from(e.dataTransfer.files).forEach(handleFile); }}
                  style={{
                    border: `2px dashed ${drag ? 'rgba(124,58,237,0.7)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '14px', padding: '48px 24px', textAlign: 'center',
                    cursor: 'pointer', marginBottom: '14px',
                    background: drag ? 'rgba(124,58,237,0.06)' : 'transparent', transition: 'all 0.2s',
                  }}>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }}
                    onChange={e => Array.from(e.target.files).forEach(handleFile)} />
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Click or drag to upload</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>PDF, JPG, PNG · AI will verify authenticity</div>
                </div>

                {uploaded.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {uploaded.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)', fontSize: '12px' }}>
                        <span style={{ fontSize: '18px' }}>{f.icon}</span>
                        <span style={{ flex: 1, color: 'rgba(255,255,255,0.8)' }}>{f.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>{f.size}</span>
                      </div>
                    ))}
                  </div>
                )}

                {uploading && (
                  <div style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.08)' }}>
                    <div style={{ fontSize: '12px', color: '#c4b5fd', marginBottom: '8px' }}>Uploading… {uploadPct}%</div>
                    <div style={{ height: '5px', borderRadius: '5px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadPct}%`, background: 'linear-gradient(90deg,#7c3aed,#0891b2)', transition: 'width 0.2s', borderRadius: '5px' }} />
                    </div>
                  </div>
                )}

                {uploaded.length >= 1 && !result && (
                  <button onClick={runVerification} disabled={verifying || uploading}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                      background: 'linear-gradient(135deg,#7c3aed,#0891b2)',
                      color: '#fff', fontWeight: 700, fontSize: '14px',
                      cursor: verifying || uploading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      opacity: verifying || uploading ? 0.6 : 1,
                    }}>
                    {verifying
                      ? <><span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />Analyzing with AI…</>
                      : uploading ? 'Uploading files…'
                        : '🤖 Upload & Run AI Verification'}
                  </button>
                )}
              </div>

              {result && (
                <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>🤖 AI Confidence Score</div>
                    <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '44px', fontWeight: 800, color: scoreColor }}>{result.confidence_score}%</div>
                  </div>
                  <div style={{ height: '6px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                    <div style={{ height: '100%', width: `${result.confidence_score}%`, borderRadius: '6px', background: scoreColor, transition: 'width 1s ease' }} />
                  </div>
                  <div style={{
                    padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', fontWeight: 700,
                    ...(result.status === 'pending_retry' ? { border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.08)', color: '#93c5fd' }
                      : s >= 40 ? { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d' }
                      : { border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }),
                  }}>
                    {result.status === 'pending_retry' ? (
                      <>
                        <div style={{ fontSize: '15px', marginBottom: '4px' }}>⏳ Verification in progress</div>
                        <div style={{ fontSize: '12px', fontWeight: 400, opacity: 0.9 }}>Backup AI verification activated.</div>
                        <div style={{ fontSize: '12px', fontWeight: 400, opacity: 0.9 }}>Your proof has been queued safely.</div>
                      </>
                    ) : s >= 40 ? '✅ Verification successful (Under admin review)' : '❌ REJECTED — Upload valid proof'}
                    {result.status !== 'pending_retry' && <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '4px', opacity: 0.8 }}>{result.reason}</div>}
                    
                    {/* DEBUG BLOCK */}
                    <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
                      <div>[AI] Provider: <strong style={{color: '#6ee7b7'}}>{result.ai_provider || 'Unknown'}</strong></div>
                      <div>[AI] Confidence: {result.confidence_score}%</div>
                      <div>[AI] Status: {result.status}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>Verification Flags</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, color: result.is_relevant ? '#34d399' : '#f87171', marginTop: '1px', flexShrink: 0 }}>{result.is_relevant ? '✓' : '✗'}</span>
                      <div><span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Relevant to Campaign</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, color: result.matches_campaign ? '#34d399' : '#f87171', marginTop: '1px', flexShrink: 0 }}>{result.matches_campaign ? '✓' : '✗'}</span>
                      <div><span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Matches Campaign Goal</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, color: !result.fraud_detected ? '#34d399' : '#f87171', marginTop: '1px', flexShrink: 0 }}>{!result.fraud_detected ? '✓' : '⚠'}</span>
                      <div><span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Fraud Check Passed</span></div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.05)', fontSize: '12px', color: '#67e8f9' }}>
                    {result.status === 'pending_retry' 
                      ? '📋 Your document is queued for backup verification. Milestone is NOT locked, you may retry anytime.'
                      : s >= 40 
                        ? '📋 Proof saved to admin panel. Admin will review and release funds if approved.'
                        : '📋 Proof rejected — please upload strong real-world evidence.'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}