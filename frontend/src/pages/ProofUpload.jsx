import { useEffect, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

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
  if (n > 0 && total > 0 && c.milestones.every(m => !m.amount || m.amount === 0)) {
    const per = Math.floor(total / n);
    c.milestones = c.milestones.map((m, i) => ({
      ...m, amount: i === n - 1 ? total - per * (n - 1) : per,
    }));
  }
  return c;
}

function getMilestoneHint(milestone, msIndex) {
  const title = milestone?.title || '';
  const isDefault = /^Milestone\s+\d+$/i.test(title.trim());
  if (!isDefault && title.trim()) {
    return `Upload proof for: "${title}" — receipts, certificates, reports, or official letters confirming completion.`;
  }
  const fallbacks = [
    'Upload: Invoice / Admission letter / Initial report confirming the milestone was started',
    'Upload: Progress report / Certificate / Receipt confirming milestone completion',
    'Upload: Final report / Bank statement / Official confirmation of funds utilisation',
    'Upload: Outcome report / Beneficiary testimonial / Verification letter',
    'Upload: Closure document / Final audit / Summary report from authorised person',
  ];
  return fallbacks[msIndex] || fallbacks[fallbacks.length - 1];
}

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

const MS_STYLE = {
  verified:             { border: '1px solid rgba(16,185,129,0.4)',  background: 'rgba(16,185,129,0.06)',  color: '#6ee7b7'              },
  approved:             { border: '1px solid rgba(16,185,129,0.4)',  background: 'rgba(16,185,129,0.06)',  color: '#6ee7b7'              },
  pending_admin_review: { border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d'              },
  pending:              { border: '1px solid rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.1)',  color: '#c4b5fd'              },
  locked:               { border: '1px solid rgba(255,255,255,0.08)',background: 'rgba(255,255,255,0.03)',color: 'rgba(255,255,255,0.3)'},
  rejected:             { border: '1px solid rgba(239,68,68,0.35)',  background: 'rgba(239,68,68,0.06)',  color: '#fca5a5'              },
};
const PILL = {
  verified:             { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7',              border: '1px solid rgba(16,185,129,0.3)'  },
  approved:             { background: 'rgba(16,185,129,0.15)',  color: '#6ee7b7',              border: '1px solid rgba(16,185,129,0.3)'  },
  pending_admin_review: { background: 'rgba(245,158,11,0.15)', color: '#fcd34d',              border: '1px solid rgba(245,158,11,0.3)' },
  pending:              { background: 'rgba(245,158,11,0.15)', color: '#fcd34d',              border: '1px solid rgba(245,158,11,0.3)' },
  locked:               { background: 'rgba(255,255,255,0.05)',color: 'rgba(255,255,255,0.3)',border: '1px solid rgba(255,255,255,0.08)'},
  rejected:             { background: 'rgba(239,68,68,0.15)',  color: '#fca5a5',              border: '1px solid rgba(239,68,68,0.3)'  },
};

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

  const [campaigns,     setCampaigns]     = useState([]);
  const [selCampaign,   setSelCampaign]   = useState(null);
  const [loadingCamps,  setLoadingCamps]  = useState(true);
  const [submittedProofs, setSubmittedProofs] = useState({});

  const [uploaded,  setUploaded]  = useState([]);
  const [fileObjs,  setFileObjs]  = useState([]);
  const [drag,      setDrag]      = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result,    setResult]    = useState(null);
  const [imgBase64, setImgBase64] = useState(null);
  const [imgType,   setImgType]   = useState(null);

  // ── Load campaigns + proofs ───────────────────────────────────────────────
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

        const proofSnap = await getDocs(
          query(collection(db, 'proofs'), where('ngoId', '==', user.uid))
        );
        const allProofs = proofSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));

        const proofMap = {};
        allProofs.forEach(p => {
          if (!p.campaignId || p.milestoneNo == null) return;
          const key = `${String(p.campaignId)}_${String(p.milestoneNo)}`;
          if (!proofMap[key]) {
            proofMap[key] = { milestoneNo: Number(p.milestoneNo), status: p.status, aiScore: p.aiScore };
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
    setUploaded(prev => [...prev, { name: file.name, size: (file.size/1024/1024).toFixed(1)+' MB', icon: '📄' }]);
    setFileObjs(prev => [...prev, file]);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => { setImgBase64(e.target.result.split(',')[1]); setImgType(file.type); };
      reader.readAsDataURL(file);
    }
  };

  // ── Save proof to Firestore ───────────────────────────────────────────────
  const saveProof = async (fileUrls, aiResult, finalStatus) => {
    if (!selCampaign) return;
    const currentMs = selCampaign.currentMilestone || 1;

    if (aiResult?.decision === 'pending_retry' || finalStatus === 'pending_retry') {
      const key = `${String(selCampaign.id)}_${String(currentMs)}`;
      setSubmittedProofs(prev => ({ ...prev, [key]: { milestoneNo: currentMs, status: 'pending_retry', aiScore: aiResult?.confidence_score } }));
      return;
    }

    // ✅ Save rejected proofs too — so NGO can see history
    // But DO NOT lock milestone for rejected proofs
    await addDoc(collection(db, 'proofs'), {
      campaignId:    selCampaign.id,
      campaignTitle: selCampaign.title || '',
      ngoId:         user.uid,
      ngoName:       user.displayName || '',
      milestoneNo:   currentMs,
      fileUrls,
      aiScore:       aiResult?.confidence_score ?? null,
      aiVerdict:     aiResult?.status            ?? null,
      aiSummary:     aiResult?.reason            ?? null,
      aiProvider:    'TransparentFund AI',
      status:        finalStatus,
      uploadedAt:    serverTimestamp(),
    });

    if (finalStatus === 'pending_admin_review') {
      // Update campaign milestones only when going to admin review
      const msIndex = currentMs - 1;
      const updatedMilestones = normalizeMilestones(selCampaign.milestones).map((m, i) =>
        i === msIndex ? { ...m, status: 'verified' } : m
      );
      await updateDoc(doc(db, 'campaigns', selCampaign.id), {
        milestones: updatedMilestones,
        currentMilestone: currentMs + 1,
      });
      const updateCamp = camp => ({
        ...camp,
        milestones: normalizeMilestones(camp.milestones).map((m, i) =>
          i === msIndex ? { ...m, status: 'verified' } : m
        ),
        currentMilestone: currentMs + 1,
      });
      setSelCampaign(prev => prev ? updateCamp(prev) : prev);
      setCampaigns(prev => prev.map(c => c.id === selCampaign.id ? updateCamp(c) : c));
    }

    const key = `${String(selCampaign.id)}_${String(currentMs)}`;
    setSubmittedProofs(prev => ({
      ...prev,
      [key]: { milestoneNo: currentMs, status: finalStatus, aiScore: aiResult?.confidence_score }
    }));
  };

  // ── Main verification ─────────────────────────────────────────────────────
  const runVerification = async () => {
    if (fileObjs.length === 0)  { onToast('No file uploaded', 'error'); return; }
    if (!selCampaign)           { onToast('Select a campaign first', 'error'); return; }

    const allowed = ['image/jpeg','image/jpg','image/png','image/webp','application/pdf'];
    for (const file of fileObjs) {
      if (file.size < 5120)               { onToast(`File ${file.name} is too small (<5KB).`, 'error'); return; }
      if (!allowed.includes(file.type))   { onToast('Only JPG, PNG, WEBP, or PDF allowed.', 'error'); return; }
    }

    setUploading(true); setUploadPct(0);
    const fileUrls = [];
    try {
      for (let i = 0; i < fileObjs.length; i++) {
        fileUrls.push(await uploadToCloudinary(
          fileObjs[i],
          pct => setUploadPct(Math.round((i/fileObjs.length)*100 + pct/fileObjs.length))
        ));
      }
    } catch (e) { onToast('Upload failed: ' + e.message, 'error'); setUploading(false); return; }
    setUploading(false); setUploadPct(100);
    setVerifying(true); setResult(null);

    const ms    = selCampaign.currentMilestone || 1;
    const msList = normalizeMilestones(selCampaign.milestones);
    const msAmt  = msList[ms - 1]?.amount || 0;

    // ✅ Send ONLY campaign context — backend builds the full forensic prompt
    // This is the fix: no more double-wrapping that caused Gemini 400 errors
    const campaignContext = `Campaign: "${selCampaign.title}" | Milestone ${ms} | Amount: ₹${msAmt.toLocaleString('en-IN')}`;

    let aiResult = null;
    try {
      if (imgBase64) {
        const content = [
          { type: 'image', source: { type: 'base64', media_type: imgType, data: imgBase64 } },
          { type: 'text', text: campaignContext },
        ];
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/ai/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content }]
          }),
        });
        const data = await res.json();
        const raw  = data.content?.[0]?.text ?? '{}';
        const match = raw.match(/\{[\s\S]*\}/);
        aiResult = JSON.parse(match ? match[0] : raw);
      } else {
        // PDF — cannot do vision analysis
        aiResult = {
          status: 'rejected',
          confidence_score: 30,
          reason: 'PDF files cannot be visually verified. Please upload a JPG or PNG photo of the document.',
          is_relevant: true,
          matches_campaign: true,
          fraud_detected: false,
          decision: 'reject',
          risk_label: 'LOW_TRUST',
        };
      }
    } catch (error) {
      console.error('Error in runVerification:', error);
      aiResult = {
        status: 'pending_retry',
        confidence_score: 0,
        reason: 'AI verification temporarily unavailable. Queued for retry.',
        is_relevant: true,
        matches_campaign: true,
        fraud_detected: false,
        decision: 'pending_retry',
        risk_label: 'HIGH_RISK_FRAUD',
      };
    }

    const score = aiResult.confidence_score ?? 0;

    // ✅ Threshold: 75+ = admin review, below = rejected
    let finalStatus;
    if (aiResult.decision === 'pending_retry' || aiResult.status === 'pending_retry') {
      finalStatus = 'pending_retry';
    } else if (score >= 75) {
      finalStatus = 'pending_admin_review';
    } else {
      finalStatus = 'rejected';
    }

    aiResult.status = finalStatus;
    setResult(aiResult);

    try { await saveProof(fileUrls, aiResult, finalStatus); }
    catch (e) { console.error('saveProof failed:', e); }

    if (finalStatus === 'pending_admin_review') {
      onToast(`✅ Verification completed (${score}% confidence) — sent to admin review`, 'success');
    } else if (finalStatus === 'pending_retry') {
      onToast('⏳ AI temporarily unavailable. Proof queued for retry.', 'warning');
    } else {
      onToast(`❌ Score ${score}% — below 75% threshold. Please upload a clearer document.`, 'error');
    }
    setVerifying(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const safeMilestones     = normalizeMilestones(selCampaign?.milestones);
  const totalMilestones    = safeMilestones.length;
  const currentMsNo        = selCampaign?.currentMilestone || 1;
  const currentMsIndex     = currentMsNo - 1;
  const currentMsObj       = safeMilestones[currentMsIndex];
  const currentMsTitle     = currentMsObj?.title || '';
  const allMilestonesComplete = currentMsNo > totalMilestones && totalMilestones > 0;

  const currentProofKey    = selCampaign ? `${String(selCampaign.id)}_${String(currentMsNo)}` : null;
  const currentProofData   = currentProofKey ? submittedProofs[currentProofKey] : null;
  const currentProofStatus = currentProofData?.status || null;

  // ✅ FIXED: Only block re-upload if under admin review or already approved
  // Rejected proofs CAN be re-uploaded (NGO gets another chance)
  const blockUpload = currentProofStatus === 'pending_admin_review' ||
                      currentProofStatus === 'approved';

  const scoreColor = (result?.confidence_score ?? 0) >= 75 ? '#34d399' : '#f87171';

  if (!loadingCamps && campaigns.length === 0) {
    return (
      <div style={{ minHeight:'calc(100vh - 68px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px' }}>
        <div style={{ textAlign:'center', maxWidth:'400px' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>📭</div>
          <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'22px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>No active campaigns</h3>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px' }}>Create a campaign first before uploading milestone proof.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight:'100vh' }}>
      <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'30px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>
        Upload Milestone Proof
      </h2>
      <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'14px', marginBottom:'20px' }}>
        AI verifies every document — score ≥ 75% goes to admin review, below is rejected
      </p>

      {/* Campaign selector */}
      {campaigns.length > 1 && (
        <div style={{ marginBottom:'16px' }}>
          <label style={{ fontSize:'12px', fontWeight:600, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:'8px' }}>Select campaign</label>
          <select value={selCampaign?.id || ''} onChange={e => handleCampaignChange(e.target.value)}
            style={{ padding:'11px 14px', borderRadius:'10px', background:'#111827', color:'#fff', border:'1px solid rgba(255,255,255,0.12)', fontSize:'14px', outline:'none', cursor:'pointer', width:'100%', maxWidth:'400px' }}>
            <option value="">Choose campaign…</option>
            {campaigns.map(c => <option key={c.id} value={c.id} style={{ background:'#111827' }}>{c.title}</option>)}
          </select>
        </div>
      )}

      {/* All milestones complete */}
      {selCampaign && allMilestonesComplete && (
        <div style={{ padding:'40px 32px', borderRadius:'20px', border:'1px solid rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.07)', textAlign:'center', marginBottom:'24px' }}>
          <div style={{ fontSize:'52px', marginBottom:'16px' }}>🎉</div>
          <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:'#fff', marginBottom:'8px' }}>
            All {totalMilestones} milestones complete!
          </h3>
        </div>
      )}

      {/* Status banners — shown based on current proof status */}
      {selCampaign && !allMilestonesComplete && currentProofStatus === 'pending_admin_review' && (
        <div style={{ padding:'20px 24px', borderRadius:'16px', marginBottom:'20px', border:'1px solid rgba(245,158,11,0.4)', background:'rgba(245,158,11,0.07)' }}>
          <div style={{ fontSize:'14px', fontWeight:700, color:'#fcd34d', marginBottom:'6px' }}>
            ⏳ Proof submitted for Milestone {currentMsNo} — awaiting admin review
          </div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)' }}>
            AI score: <strong>{currentProofData?.aiScore ?? '—'}%</strong> · You cannot re-upload until admin reviews
          </div>
        </div>
      )}

      {selCampaign && !allMilestonesComplete && currentProofStatus === 'approved' && (
        <div style={{ padding:'20px 24px', borderRadius:'16px', marginBottom:'20px', border:'1px solid rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.07)' }}>
          <div style={{ fontSize:'14px', fontWeight:700, color:'#6ee7b7' }}>
            ✅ Milestone {currentMsNo} proof approved — next milestone is now active
          </div>
        </div>
      )}

      {selCampaign && !allMilestonesComplete && currentProofStatus === 'rejected' && !result && (
        <div style={{ padding:'20px 24px', borderRadius:'16px', marginBottom:'20px', border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.07)' }}>
          <div style={{ fontSize:'14px', fontWeight:700, color:'#fca5a5', marginBottom:'6px' }}>
            ❌ Previous proof was rejected (score: {currentProofData?.aiScore ?? '—'}%) — upload a clearer document below ↓
          </div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)' }}>
            Use a real photographed/scanned document. AI-generated images are automatically rejected.
          </div>
        </div>
      )}

      {/* Milestone hint */}
      {selCampaign && !allMilestonesComplete && !blockUpload && currentMsObj && (
        <div style={{ marginBottom:'20px', padding:'10px 14px', borderRadius:'10px', border:'1px solid rgba(34,211,238,0.2)', background:'rgba(34,211,238,0.05)', fontSize:'12px', color:'#67e8f9' }}>
          📋 <strong>Milestone {currentMsNo}{currentMsTitle ? ` — ${currentMsTitle}` : ''} documents:</strong>{' '}
          {getMilestoneHint(currentMsObj, currentMsIndex)}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'24px' }}>

        {/* Left — Milestones list */}
        <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'24px' }}>
          <h3 style={{ fontSize:'16px', fontWeight:700, color:'#fff', marginBottom:'8px' }}>Campaign Milestones</h3>
          {selCampaign ? (
            <>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', marginBottom:'16px', padding:'10px 14px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.07)', background:'rgba(124,58,237,0.06)' }}>
                📋 {selCampaign.title}<br/>
                Goal: ₹{(selCampaign.targetAmount||0).toLocaleString('en-IN')} · {totalMilestones} milestone{totalMilestones!==1?'s':''}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {safeMilestones.map((m, i) => {
                  const msNo     = i + 1;
                  const isCurrent = msNo === currentMsNo && !allMilestonesComplete;
                  const proofKey  = `${String(selCampaign.id)}_${String(msNo)}`;
                  const proof     = submittedProofs[proofKey];

                  let displayStatus;
                  if      (m.status === 'verified' || m.status === 'approved') displayStatus = 'verified';
                  else if (proof && proof.status !== 'pending_retry')           displayStatus = proof.status;
                  else if (msNo < currentMsNo)                                  displayStatus = 'pending_admin_review';
                  else if (isCurrent)                                           displayStatus = 'pending';
                  else                                                           displayStatus = 'locked';

                  const amt = m.amount && m.amount > 0 ? m.amount : (() => {
                    const total = Number(selCampaign.targetAmount)||0, n=totalMilestones;
                    if (!total||!n) return 0;
                    const per = Math.floor(total/n);
                    return i===n-1 ? total-per*(n-1) : per;
                  })();

                  return (
                    <div key={i} style={{ padding:'14px 16px', borderRadius:'12px', ...(MS_STYLE[displayStatus]||MS_STYLE.locked) }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                        <span style={{ fontSize:'13px', fontWeight:600 }}>{m.title || `Milestone ${msNo}`}</span>
                        <span style={{ fontSize:'10px', fontWeight:700, padding:'3px 9px', borderRadius:'999px', ...(PILL[displayStatus]||PILL.locked) }}>
                          {getPillLabel(displayStatus)}
                        </span>
                      </div>
                      <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.45)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span>₹{amt.toLocaleString('en-IN')}</span>
                        {isCurrent && !blockUpload && <span style={{ color:'#c4b5fd', fontSize:'11px' }}>← Upload proof here</span>}
                        {msNo > currentMsNo && <span style={{ color:'rgba(255,255,255,0.2)', fontSize:'11px' }}>🔒 Locked</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'13px' }}>Select a campaign to see milestones.</div>
          )}
        </div>

        {/* Right — Upload area */}
        <div>
          {(!selCampaign || allMilestonesComplete || blockUpload) ? (
            <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:'40px', marginBottom:'12px' }}>
                {allMilestonesComplete ? '✅' : blockUpload ? '⏳' : '📋'}
              </div>
              <div style={{ fontSize:'14px', fontWeight:600, color:'rgba(255,255,255,0.5)' }}>
                {!selCampaign              ? 'Select a campaign to begin'
                : allMilestonesComplete   ? 'All milestones completed'
                : currentProofStatus === 'pending_admin_review' ? 'Proof under review — cannot re-upload'
                : 'Milestone approved ✅'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'24px', marginBottom:'16px' }}>
                <h3 style={{ fontSize:'16px', fontWeight:700, color:'#fff', marginBottom:'4px' }}>Upload Documents</h3>
                <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)', marginBottom:'20px' }}>
                  Milestone {currentMsNo} of {totalMilestones}{currentMsTitle ? ` — ${currentMsTitle}` : ''}
                  {currentProofStatus === 'rejected' && <span style={{ color:'#fca5a5', marginLeft:'8px' }}>· Previous attempt rejected — try again</span>}
                </p>

                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={() => setDrag(true)}
                  onDragLeave={() => setDrag(false)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); setDrag(false); Array.from(e.dataTransfer.files).forEach(handleFile); }}
                  style={{
                    border:`2px dashed ${drag?'rgba(124,58,237,0.7)':'rgba(255,255,255,0.1)'}`,
                    borderRadius:'14px', padding:'48px 24px', textAlign:'center',
                    cursor:'pointer', marginBottom:'14px',
                    background: drag?'rgba(124,58,237,0.06)':'transparent', transition:'all 0.2s',
                  }}>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display:'none' }}
                    onChange={e => Array.from(e.target.files).forEach(handleFile)} />
                  <div style={{ fontSize:'32px', marginBottom:'12px' }}>📄</div>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#fff', marginBottom:'4px' }}>Click or drag to upload</div>
                  <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)' }}>JPG, PNG, WEBP recommended · PDF limited · Score ≥ 75% required</div>
                </div>

                {uploaded.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'16px' }}>
                    {uploaded.map((f, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', borderRadius:'10px', border:'1px solid rgba(16,185,129,0.2)', background:'rgba(16,185,129,0.06)', fontSize:'12px' }}>
                        <span style={{ fontSize:'18px' }}>{f.icon}</span>
                        <span style={{ flex:1, color:'rgba(255,255,255,0.8)' }}>{f.name}</span>
                        <span style={{ color:'rgba(255,255,255,0.3)' }}>{f.size}</span>
                      </div>
                    ))}
                  </div>
                )}

                {uploading && (
                  <div style={{ marginBottom:'14px', padding:'12px 16px', borderRadius:'10px', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.08)' }}>
                    <div style={{ fontSize:'12px', color:'#c4b5fd', marginBottom:'8px' }}>Uploading… {uploadPct}%</div>
                    <div style={{ height:'5px', borderRadius:'5px', background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${uploadPct}%`, background:'linear-gradient(90deg,#7c3aed,#0891b2)', transition:'width 0.2s', borderRadius:'5px' }} />
                    </div>
                  </div>
                )}

                {uploaded.length >= 1 && !result && (
                  <button onClick={runVerification} disabled={verifying||uploading}
                    style={{
                      width:'100%', padding:'14px', borderRadius:'12px', border:'none',
                      background:'linear-gradient(135deg,#7c3aed,#0891b2)',
                      color:'#fff', fontWeight:700, fontSize:'14px',
                      cursor:verifying||uploading?'not-allowed':'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                      opacity:verifying||uploading?0.6:1,
                    }}>
                    {verifying
                      ? <><span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }}/>Analyzing with AI…</>
                      : uploading ? 'Uploading files…'
                      : '🤖 Upload & Run AI Verification'}
                  </button>
                )}
              </div>

              {result && (
                <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'24px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'rgba(255,255,255,0.6)' }}>🤖 AI Confidence Score</div>
                    <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'44px', fontWeight:800, color:scoreColor }}>
                      {result.confidence_score}%
                    </div>
                  </div>
                  <div style={{ height:'6px', borderRadius:'6px', overflow:'hidden', background:'rgba(255,255,255,0.08)', marginBottom:'16px' }}>
                    <div style={{ height:'100%', width:`${result.confidence_score}%`, borderRadius:'6px', background:scoreColor, transition:'width 1s ease' }} />
                  </div>

                  <div style={{
                    padding:'12px 16px', borderRadius:'12px', marginBottom:'16px', fontSize:'13px', fontWeight:700,
                    ...(result.status==='pending_retry'
                      ? { border:'1px solid rgba(59,130,246,0.4)', background:'rgba(59,130,246,0.08)', color:'#93c5fd' }
                      : result.confidence_score >= 75
                      ? { border:'1px solid rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.08)', color:'#6ee7b7' }
                      : { border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.08)', color:'#fca5a5' }),
                  }}>
                    {result.status === 'pending_retry'
                      ? '⏳ AI temporarily unavailable — proof queued for retry'
                      : result.confidence_score >= 75
                      ? '✅ Score ≥ 75% — Sent to admin review'
                      : `❌ Score ${result.confidence_score}% — below 75% threshold`}
                    {result.reason && (
                      <div style={{ fontSize:'12px', fontWeight:400, marginTop:'4px', opacity:0.85 }}>{result.reason}</div>
                    )}
                  </div>

                  {/* Verification flags */}
                  <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:'10px' }}>
                    Verification Flags
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginBottom:'16px' }}>
                    {[
                      { label:'Relevant to Campaign',  val: result.is_relevant },
                      { label:'Matches Campaign Goal', val: result.matches_campaign },
                      { label:'Fraud Check Passed',    val: !result.fraud_detected },
                    ].map(f => (
                      <div key={f.label} style={{ display:'flex', gap:'10px', fontSize:'12px', alignItems:'center' }}>
                        <span style={{ fontWeight:700, color:f.val?'#34d399':'#f87171', flexShrink:0 }}>{f.val?'✓':'✗'}</span>
                        <span style={{ color:'rgba(255,255,255,0.7)' }}>{f.label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding:'10px 14px', borderRadius:'10px', border:'1px solid rgba(34,211,238,0.2)', background:'rgba(34,211,238,0.05)', fontSize:'12px', color:'#67e8f9' }}>
                    {result.status === 'pending_retry'
                      ? '📋 Queued for retry. You may upload again.'
                      : result.confidence_score >= 75
                      ? '📋 Proof sent to admin panel for final review and fund release.'
                      : '📋 Rejected — upload a real photographed/scanned document with visible paper texture.'}
                  </div>

                  {/* Allow retry after rejection */}
                  {result.confidence_score < 75 && result.status !== 'pending_retry' && (
                    <button
                      onClick={() => { setResult(null); setUploaded([]); setFileObjs([]); setImgBase64(null); setImgType(null); }}
                      style={{ width:'100%', marginTop:'12px', padding:'11px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                      ↩ Try Again with Different Document
                    </button>
                  )}
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