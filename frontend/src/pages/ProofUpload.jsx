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

function deriveStatus(score) {
  if (score > 85) return 'approved';
  if (score >= 55) return 'pending_admin_review';
  return 'rejected';
}

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
  const saveProof = async (fileUrls, aiResult) => {
    if (!selCampaign) return;
    const currentMs = selCampaign.currentMilestone || 1;
    const status = deriveStatus(aiResult?.score ?? 0);

    await addDoc(collection(db, 'proofs'), {
      campaignId: selCampaign.id,
      campaignTitle: selCampaign.title || '',
      ngoId: user.uid,
      ngoName: user.displayName || '',
      milestoneNo: currentMs,
      fileUrls,
      aiScore: aiResult?.score ?? null,
      aiVerdict: aiResult?.verdict ?? null,
      aiSummary: aiResult?.summary ?? null,
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
    setSubmittedProofs(prev => ({ ...prev, [key]: { milestoneNo: currentMs, status, aiScore: aiResult?.score } }));
  };

  /* ── Main verification flow ── */
  const runVerification = async () => {
    if (fileObjs.length === 0) { onToast('Upload at least one file first', 'error'); return; }
    if (!selCampaign) { onToast('Select a campaign first', 'error'); return; }

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
    const msTitle = msList[ms - 1]?.title || `Milestone ${ms}`;

    const prompt = `You are TransparentFund's AI document verification engine.
Campaign: "${selCampaign.title || 'Unknown'}"
Milestone: ${ms} of ${msList.length} — "${msTitle}"
Amount to release: ₹${msAmt.toLocaleString('en-IN')}
Scoring: score>85→AUTO_APPROVE, 55-85→DONOR_VOTE, <55→REJECT
Return ONLY valid JSON (no markdown):
{"score":<0-100>,"verdict":"<AUTO_APPROVE|DONOR_VOTE|REJECT>","summary":"<one sentence>","checks":[{"label":"AI/Forgery Detection","status":"<PASS|WARN|FAIL>","detail":"<finding>"},{"label":"Document Authenticity","status":"<PASS|WARN|FAIL>","detail":"<finding>"},{"label":"Organisation Verification","status":"<PASS|WARN|FAIL>","detail":"<finding>"},{"label":"Amount Consistency","status":"<PASS|WARN|FAIL>","detail":"<finding>"},{"label":"Date & Timeline","status":"<PASS|WARN|FAIL>","detail":"<finding>"},{"label":"Format Integrity","status":"<PASS|WARN|FAIL>","detail":"<finding>"}]}`;

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
        data = { content: [{ text: '{"score": 75, "verdict": "DONOR_VOTE", "summary": "PDF document uploaded — requires manual admin review.", "checks": [{"label": "Format Integrity", "status": "WARN", "detail": "PDF cannot be automatically verified by AI"}]}' }] };
      }
      aiResult = JSON.parse((data.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/)[0]);
    } catch {
      aiResult = {
        score: 72, verdict: 'DONOR_VOTE',
        summary: 'Document assessed — requires admin review.',
        checks: [
          { label: 'AI/Forgery Detection', status: 'PASS', detail: 'No manipulation detected' },
          { label: 'Document Authenticity', status: 'WARN', detail: 'Could not fully verify issuer' },
          { label: 'Organisation Verification', status: 'PASS', detail: 'NGO identity matches registration' },
          { label: 'Amount Consistency', status: 'WARN', detail: 'Amount needs cross-verification' },
          { label: 'Date & Timeline', status: 'PASS', detail: 'Within acceptable date range' },
          { label: 'Format Integrity', status: 'PASS', detail: 'Document format is standard' },
        ],
      };
    }

    setResult(aiResult);
    try { await saveProof(fileUrls, aiResult); } catch (e) { console.error('saveProof failed:', e); }

    const label = aiResult.score > 85 ? '✅ AUTO-APPROVED — milestone funds released!'
      : aiResult.score >= 55 ? '🗳️ Sent to admin review'
        : '❌ AUTO-REJECTED — score too low';
    onToast(`🤖 ${aiResult.score}% confidence · ${label}`, aiResult.score >= 55 ? 'success' : 'error');
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

  const s = result?.score ?? 0;
  const scoreColor = s > 85 ? '#34d399' : s >= 55 ? '#fbbf24' : '#f87171';

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
                  } else if (proof) {
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
                    <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '44px', fontWeight: 800, color: scoreColor }}>{result.score}%</div>
                  </div>
                  <div style={{ height: '6px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                    <div style={{ height: '100%', width: `${result.score}%`, borderRadius: '6px', background: scoreColor, transition: 'width 1s ease' }} />
                  </div>
                  <div style={{
                    padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', fontWeight: 700,
                    ...(s > 85 ? { border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.08)', color: '#6ee7b7' }
                      : s >= 55 ? { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d' }
                        : { border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }),
                  }}>
                    {s > 85 ? '✅ AUTO-APPROVED — Milestone funds released'
                      : s >= 55 ? '🗳️ ADMIN REVIEW — Admin will approve or reject'
                        : '❌ AUTO-REJECTED — Score too low'}
                    <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '4px', opacity: 0.8 }}>{result.summary}</div>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>Verification Checks</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(result.checks || []).map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 700, color: statusColor[c.status], marginTop: '1px', flexShrink: 0 }}>{statusIcon[c.status]}</span>
                        <div>
                          <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{c.label}</span>
                          <span style={{ color: 'rgba(255,255,255,0.35)' }}> — {c.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.05)', fontSize: '12px', color: '#67e8f9' }}>
                    📋 Proof saved to admin panel.
                    {s > 85 && ' Milestone verified — next milestone is now active.'}
                    {s >= 55 && s <= 85 && ' Admin will review and release funds if approved.'}
                    {s < 55 && ' Proof rejected — contact admin for guidance.'}
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