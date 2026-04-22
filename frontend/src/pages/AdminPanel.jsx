import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_STYLE = {
  pending:  { background:'rgba(245,158,11,0.15)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' },
  approved: { background:'rgba(16,185,129,0.15)', color:'#6ee7b7', border:'1px solid rgba(16,185,129,0.35)' },
  rejected: { background:'rgba(239,68,68,0.15)',  color:'#fca5a5', border:'1px solid rgba(239,68,68,0.35)'  },
};
const PROOF_STATUS_STYLE = {
  pending_admin_review: { background:'rgba(245,158,11,0.15)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' },
  approved:             { background:'rgba(16,185,129,0.15)', color:'#6ee7b7', border:'1px solid rgba(16,185,129,0.35)' },
  rejected:             { background:'rgba(239,68,68,0.15)',  color:'#fca5a5', border:'1px solid rgba(239,68,68,0.35)'  },
};
const DOC_LABELS = {
  regCertificate:'Registration Certificate', panCard:'PAN Card',
  authLetter:'Authorisation Letter', cert80G:'80G / 12A Certificate', auditReport:'Audit Report',
};
const RISK_STYLE = {
  LOW:    { bg:'rgba(16,185,129,0.15)',  color:'#6ee7b7', border:'rgba(16,185,129,0.4)',  icon:'🟢' },
  MEDIUM: { bg:'rgba(245,158,11,0.15)', color:'#fcd34d', border:'rgba(245,158,11,0.4)', icon:'🟡' },
  HIGH:   { bg:'rgba(239,68,68,0.15)',  color:'#fca5a5', border:'rgba(239,68,68,0.4)',  icon:'🔴' },
};

// Document classification labels for display
const DOC_CLASS_LABEL = {
  correct_document: { label: '✅ Valid Registration Certificate', color: '#6ee7b7' },
  wrong_document:   { label: '⚠️ Wrong Document Type',           color: '#fcd34d' },
  unrelated_image:  { label: '❌ Unrelated Image',               color: '#fca5a5' },
  code_image:       { label: '❌ Code Screenshot',               color: '#fca5a5' },
  screenshot:       { label: '❌ UI/Web Screenshot',             color: '#fca5a5' },
  blank:            { label: '❌ Blank / Unreadable',            color: '#fca5a5' },
  no_image:         { label: '❌ No Image Provided (PDF)',       color: '#fca5a5' },
  api_error:        { label: '⚠️ AI Service Error',             color: '#fcd34d' },
  unknown:          { label: '— Unknown',                        color: 'rgba(255,255,255,0.4)' },
};

/* ─── reusable components ─────────────────────────────── */
function InfoPopup({ type, title, message, onClose }) {
  const S = {
    success:{ icon:'✅', border:'rgba(16,185,129,0.4)', glow:'rgba(16,185,129,0.15)', color:'#6ee7b7', btn:'linear-gradient(135deg,#10b981,#0891b2)' },
    error:  { icon:'❌', border:'rgba(239,68,68,0.4)',  glow:'rgba(239,68,68,0.12)',  color:'#fca5a5', btn:'linear-gradient(135deg,#dc2626,#991b1b)' },
    warning:{ icon:'⚠️', border:'rgba(245,158,11,0.4)', glow:'rgba(245,158,11,0.12)', color:'#fcd34d', btn:'linear-gradient(135deg,#d97706,#92400e)' },
  };
  const st = S[type] || S.success;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ width:'100%', maxWidth:'400px', borderRadius:'22px', border:`1px solid ${st.border}`, background:'#0d1021', padding:'36px', textAlign:'center', boxShadow:`0 0 48px ${st.glow}` }}>
        <div style={{ fontSize:'48px', marginBottom:'14px' }}>{st.icon}</div>
        <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'20px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>{title}</h3>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'14px', lineHeight:1.7, marginBottom:'24px' }}>{message}</p>
        <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:'10px', border:'none', background:st.btn, color:'#fff', fontWeight:700, fontSize:'14px', cursor:'pointer' }}>Got it</button>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ width:'100%', maxWidth:'420px', borderRadius:'20px', border:'1px solid rgba(239,68,68,0.35)', background:'#0d1021', padding:'32px', textAlign:'center' }}>
        <div style={{ fontSize:'40px', marginBottom:'14px' }}>⚠️</div>
        <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'20px', fontWeight:800, color:'#fff', marginBottom:'10px' }}>{title}</h3>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:'14px', lineHeight:1.7, marginBottom:'24px' }}>{message}</p>
        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <button onClick={onCancel} style={{ padding:'11px 24px', borderRadius:'10px', cursor:'pointer', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:600, fontSize:'13px' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'11px 24px', borderRadius:'10px', border:'none', cursor:'pointer', fontWeight:700, fontSize:'13px', color:'#fff', ...confirmStyle }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function DocLink({ url, label }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'8px 14px', borderRadius:'8px', textDecoration:'none', border:'1px solid rgba(124,58,237,0.35)', background:'rgba(124,58,237,0.1)', color:'#c4b5fd', fontSize:'12px', fontWeight:600 }}>
      📄 {label} <span style={{ fontSize:'10px', opacity:0.6 }}>↗</span>
    </a>
  );
}

/* ─── Verification breakdown component ───────────────── */
function VerificationBreakdown({ aiVerification, regNumber, orgName }) {
  if (!aiVerification) return (
    <div style={{ padding:'12px 14px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', fontSize:'12px', color:'rgba(255,255,255,0.35)', fontStyle:'italic' }}>
      No AI verification data — this organisation was registered before the verification pipeline was added.
    </div>
  );

  const {
    formatChecks, formatScore, aiExtracted,
    aiScore, documentClassification, aiDecision,
    matchedFields, extractedTextSummary, reasoning,
    nameMatch, regMatch, redFlags, red_flags,
    aiSummary, riskScore, riskLevel, scoreBreakdown,
  } = aiVerification;

  const rs        = RISK_STYLE[riskLevel] || RISK_STYLE.HIGH;
  const allFlags  = redFlags || red_flags || [];
  const classInfo = DOC_CLASS_LABEL[documentClassification || 'unknown'] || DOC_CLASS_LABEL.unknown;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* Risk score hero */}
      <div style={{ padding:'20px', borderRadius:'14px', border:`1px solid ${rs.border}`, background:rs.bg, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:rs.color, marginBottom:'4px' }}>
            {rs.icon} {riskLevel} RISK
          </div>
          <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'36px', fontWeight:800, color:rs.color, lineHeight:1 }}>
            {riskScore}<span style={{ fontSize:'16px', fontWeight:400 }}>/100</span>
          </div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', marginTop:'4px' }}>
            {riskScore >= 65
              ? 'Passed AI threshold — admin review required before approval'
              : 'Failed AI threshold — auto-rejected, admin can override if needed'}
          </div>
        </div>
        {scoreBreakdown && (
          <div style={{ display:'flex', flexDirection:'column', gap:'5px', fontSize:'12px' }}>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>
              AI confidence: <span style={{ color: (scoreBreakdown.aiConfidence || 0) >= 65 ? '#6ee7b7' : '#fca5a5', fontWeight:700 }}>{scoreBreakdown.aiConfidence ?? aiScore ?? 0}</span>/100
            </div>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>
              Format bonus: <span style={{ color:'#a78bfa', fontWeight:700 }}>+{scoreBreakdown.formatBonus || 0}</span>
            </div>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>
              AI decision: <span style={{ color: aiDecision === 'manual_review' ? '#6ee7b7' : '#fca5a5', fontWeight:700 }}>{aiDecision || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Document classification — most important single signal */}
      <div style={{ padding:'14px 16px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
          🔍 Document Classification
        </div>
        <div style={{ fontSize:'15px', fontWeight:700, color: classInfo.color, marginBottom:'8px' }}>
          {classInfo.label}
        </div>
        {(reasoning || aiSummary) && (
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.55)', lineHeight:1.65, padding:'10px 12px', borderRadius:'8px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
            {reasoning || aiSummary}
          </div>
        )}
        {extractedTextSummary && (
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', marginTop:'8px', lineHeight:1.6 }}>
            <strong style={{ color:'rgba(255,255,255,0.55)' }}>Extracted text:</strong> {extractedTextSummary}
          </div>
        )}
      </div>

      {/* Field match results */}
      {(matchedFields && Object.keys(matchedFields).length > 0) && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(124,58,237,0.25)', background:'rgba(124,58,237,0.06)', padding:'16px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#c4b5fd', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>
            🔗 Field Match Results
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px' }}>
            {Object.entries(matchedFields).map(([key, val]) => (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px' }}>
                <span style={{ fontWeight:700, color: val === true ? '#34d399' : val === false ? '#f87171' : 'rgba(255,255,255,0.3)', flexShrink:0 }}>
                  {val === true ? '✓' : val === false ? '✗' : '—'}
                </span>
                <span style={{ color: val === true ? '#6ee7b7' : val === false ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI extracted data */}
      {aiExtracted && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(124,58,237,0.2)', background:'rgba(124,58,237,0.04)', padding:'16px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#c4b5fd', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>
            🤖 AI Extracted Data vs Declared
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:'12px', marginBottom:'10px' }}>
            {[
              { label:'Extracted org name',  val: aiExtracted.orgName,      match: nameMatch ?? matchedFields?.organization_name },
              { label:'Extracted reg number',val: aiExtracted.regNumber,    match: regMatch  ?? matchedFields?.registration_number },
              { label:'Issuing authority',   val: aiExtracted.authority,    match: null },
              { label:'Registration date',   val: aiExtracted.registeredOn, match: null },
              { label:'Document type',       val: aiExtracted.documentType, match: null },
            ].filter(f => f.val).map(f => (
              <div key={f.label}>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>{f.label}</div>
                <div style={{ fontSize:'13px', color: f.match === true ? '#6ee7b7' : f.match === false ? '#fca5a5' : 'rgba(255,255,255,0.75)', display:'flex', alignItems:'center', gap:'4px' }}>
                  {f.match === true ? '✓ ' : f.match === false ? '✗ ' : ''}{f.val}
                </div>
              </div>
            ))}
          </div>
          {typeof aiScore === 'number' && (
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'10px' }}>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', flexShrink:0 }}>AI confidence:</div>
              <div style={{ height:'6px', borderRadius:'6px', flex:1, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${aiScore}%`, borderRadius:'6px', background: aiScore >= 65 ? '#10b981' : aiScore >= 40 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <div style={{ fontSize:'13px', fontWeight:700, color: aiScore >= 65 ? '#6ee7b7' : aiScore >= 40 ? '#fcd34d' : '#fca5a5', flexShrink:0 }}>{aiScore}%</div>
            </div>
          )}
        </div>
      )}

      {/* Format checks */}
      {formatChecks?.length > 0 && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', padding:'16px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.5)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>
            📋 Format Validation ({formatScore}% pass rate)
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {formatChecks.map((c, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'12px' }}>
                <span style={{ fontWeight:700, color: c.pass ? '#34d399' : '#f87171', flexShrink:0 }}>{c.pass ? '✓' : '✗'}</span>
                <span style={{ color:'rgba(255,255,255,0.6)', minWidth:'140px' }}>{c.label}</span>
                <span style={{ color:'rgba(255,255,255,0.3)' }}>{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red flags */}
      {allFlags.length > 0 && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.06)', padding:'16px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#fca5a5', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
            ⚠ Red Flags ({allFlags.length})
          </div>
          {allFlags.map((f, i) => (
            <div key={i} style={{ display:'flex', gap:'8px', fontSize:'13px', color:'#fca5a5', marginBottom: i < allFlags.length-1 ? '6px' : 0 }}>
              <span style={{ flexShrink:0 }}>•</span>{f}
            </div>
          ))}
        </div>
      )}

      {/* Registry verification links — FIXED URLs */}
      <div style={{ borderRadius:'12px', border:'1px solid rgba(34,211,238,0.2)', background:'rgba(34,211,238,0.04)', padding:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:700, color:'#67e8f9', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
          🌐 Manual Registry Verification
        </div>
        <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', lineHeight:1.6, marginBottom:'12px' }}>
          Open the government portal and search for the registration number below to cross-verify manually.
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
          {/* NGO Darpan — correct search URL */}
          <a href="https://ngodarpan.gov.in/index.php/search/" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'9px 16px', borderRadius:'8px', textDecoration:'none', border:'1px solid rgba(34,211,238,0.4)', background:'rgba(34,211,238,0.1)', color:'#67e8f9', fontSize:'12px', fontWeight:700 }}>
            🏛️ NGO Darpan ↗
          </a>
          {/* MCA — correct company search URL */}
          <a href="https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'9px 16px', borderRadius:'8px', textDecoration:'none', border:'1px solid rgba(124,58,237,0.4)', background:'rgba(124,58,237,0.1)', color:'#c4b5fd', fontSize:'12px', fontWeight:700 }}>
            🏢 MCA Company Search ↗
          </a>
          {/* Income Tax — correct 80G/12A search page */}
          <a href="https://efiling.incometax.gov.in/eFiling/Services/KnowYourTanLink.html" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'9px 16px', borderRadius:'8px', textDecoration:'none', border:'1px solid rgba(245,158,11,0.4)', background:'rgba(245,158,11,0.1)', color:'#fcd34d', fontSize:'12px', fontWeight:700 }}>
            📄 Income Tax e-Filing ↗
          </a>
        </div>
        {regNumber && (
          <div style={{ marginTop:'10px', fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>
            Search for: <strong style={{ color:'rgba(255,255,255,0.6)', userSelect:'all' }}>{regNumber}</strong>
            {orgName && <> &nbsp;|&nbsp; <strong style={{ color:'rgba(255,255,255,0.6)', userSelect:'all' }}>{orgName}</strong></>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Proofs tab ──────────────────────────────────────── */
function ProofsTab() {
  const [proofs,    setProofs]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [actioning, setActioning] = useState(null);
  const [popup,     setPopup]     = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'proofs'), orderBy('uploadedAt', 'desc')));
      setProofs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approveProof = async (proof) => {
    setActioning(proof.id);
    try {
      await updateDoc(doc(db, 'proofs', proof.id), { status:'approved', reviewedAt: new Date() });
      await updateDoc(doc(db, 'campaigns', proof.campaignId), {
        [`milestones.${proof.milestoneNo - 1}.status`]: 'verified',
        currentMilestone: proof.milestoneNo + 1,
      });
      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, status:'approved' } : p));
      setPopup({ type:'success', title:'Milestone Approved!', message:`Milestone ${proof.milestoneNo} for "${proof.campaignTitle}" approved. Funds released.` });
    } catch (e) { setPopup({ type:'error', title:'Failed', message: e.message }); }
    setActioning(null);
  };

  const rejectProof = async (proof) => {
    setActioning(proof.id);
    try {
      await updateDoc(doc(db, 'proofs', proof.id), { status:'rejected', reviewedAt: new Date() });
      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, status:'rejected' } : p));
      setPopup({ type:'warning', title:'Proof Rejected', message:`Milestone ${proof.milestoneNo} proof rejected. NGO must resubmit.` });
    } catch (e) { setPopup({ type:'error', title:'Failed', message: e.message }); }
    setActioning(null);
  };

  const shown   = filter === 'all' ? proofs : proofs.filter(p => filter === 'pending' ? p.status === 'pending_admin_review' : p.status === filter);
  const pending = proofs.filter(p => p.status === 'pending_admin_review').length;

  return (
    <div>
      {popup && <InfoPopup {...popup} onClose={() => setPopup(null)} />}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'24px' }}>
        {[{ label:'Total', val:proofs.length, color:'#a78bfa' }, { label:'Pending', val:pending, color:'#fcd34d' }, { label:'Approved', val:proofs.filter(p => p.status === 'approved').length, color:'#6ee7b7' }].map(s => (
          <div key={s.label} style={{ borderRadius:'14px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'16px 20px' }}>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'26px', fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)', marginTop:'2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius:'20px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', overflow:'hidden' }}>
        <div style={{ padding:'20px 28px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
          <div style={{ fontWeight:700, color:'#fff', fontSize:'16px' }}>
            Milestone Proofs {pending > 0 && <span style={{ marginLeft:'10px', padding:'2px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, background:'rgba(245,158,11,0.2)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' }}>{pending} pending</span>}
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            {['all','pending','approved','rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding:'5px 14px', borderRadius:'999px', cursor:'pointer', fontSize:'12px', fontWeight:600, border:'none', background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={load} style={{ padding:'7px 16px', borderRadius:'8px', cursor:'pointer', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#fff', fontWeight:600, fontSize:'13px' }}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'14px' }}>No proofs found.</div>
        ) : shown.map(proof => (
          <div key={proof.id}>
            <div onClick={() => setExpanded(expanded === proof.id ? null : proof.id)}
              style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'12px', padding:'16px 28px', cursor:'pointer', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.04)', background: expanded === proof.id ? 'rgba(255,255,255,0.025)' : 'transparent', transition:'background 0.15s' }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{proof.campaignTitle || '—'}</div>
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>{proof.ngoName} · Milestone {proof.milestoneNo}</div>
              </div>
              {typeof proof.aiScore === 'number' && (
                <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', whiteSpace:'nowrap', ...(proof.aiScore >= 65 ? { background:'rgba(245,158,11,0.15)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.3)' } : { background:'rgba(239,68,68,0.15)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.3)' }) }}>
                  {proof.aiScore >= 65 ? '🗳️' : '❌'} {proof.aiScore}%
                </span>
              )}
              <span style={{ fontSize:'11px', fontWeight:700, padding:'4px 10px', borderRadius:'999px', whiteSpace:'nowrap', ...(PROOF_STATUS_STYLE[proof.status] || PROOF_STATUS_STYLE.pending_admin_review) }}>
                {proof.status === 'pending_admin_review' ? 'Pending' : proof.status}
              </span>
              <div style={{ display:'flex', gap:'6px', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                {proof.status === 'pending_admin_review' && (
                  <>
                    <button onClick={() => approveProof(proof)} disabled={actioning === proof.id} style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.35)', whiteSpace:'nowrap' }}>✓ Approve</button>
                    <button onClick={() => rejectProof(proof)} disabled={actioning === proof.id} style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)' }}>✕</button>
                  </>
                )}
              </div>
            </div>
            {expanded === proof.id && (
              <div style={{ padding:'20px 28px 24px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.018)' }}>
                {proof.aiSummary && (
                  <div style={{ marginBottom:'16px', padding:'14px 16px', borderRadius:'12px', border:'1px solid rgba(124,58,237,0.25)', background:'rgba(124,58,237,0.06)', fontSize:'13px', color:'#c4b5fd' }}>
                    🤖 AI Summary: {proof.aiSummary}
                  </div>
                )}
                {proof.fileUrls?.length > 0 && (
                  <div style={{ marginBottom:'16px' }}>
                    <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px' }}>Uploaded Documents</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
                      {proof.fileUrls.map((url, i) => <DocLink key={i} url={url} label={`Document ${i+1}`} />)}
                    </div>
                  </div>
                )}
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.25)' }}>
                  Submitted: {proof.uploadedAt?.seconds ? new Date(proof.uploadedAt.seconds * 1000).toLocaleString('en-IN') : '—'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── NGO Requests tab ────────────────────────────────── */
function NgoRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter,   setFilter]   = useState('all');
  const [confirm,  setConfirm]  = useState(null);
  const [popup,    setPopup]    = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'ngoRequests'), orderBy('createdAt', 'desc')));
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approve = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status:'approved' });
      await updateDoc(doc(db, 'users', req.uid), { role:'ngo' });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status:'approved' } : r));
    } catch (e) { setPopup({ type:'error', title:'Failed', message: e.message }); }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'ngoRequests', req.id), { status:'rejected' });
      if (req.status === 'approved') await updateDoc(doc(db, 'users', req.uid), { role:'donor' });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status:'rejected' } : r));
    } catch (e) { setPopup({ type:'error', title:'Failed', message: e.message }); }
    setConfirm(null);
  };

  const deleteOrg = async (req) => {
    try {
      await deleteDoc(doc(db, 'ngoRequests', req.id));
      await updateDoc(doc(db, 'users', req.uid), { role:'donor' });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      if (expanded === req.id) setExpanded(null);
    } catch (e) { setPopup({ type:'error', title:'Failed', message: e.message }); }
    setConfirm(null);
  };

  const pending = requests.filter(r => r.status === 'pending').length;
  const shown   = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <>
      {popup && <InfoPopup {...popup} onClose={() => setPopup(null)} />}
      {confirm?.type === 'reject' && (
        <ConfirmModal title="Reject this organisation?" message={`This will mark ${confirm.req.orgName || confirm.req.name || 'this organisation'} as rejected.`} confirmLabel="Yes, Reject" confirmStyle={{ background:'rgba(239,68,68,0.8)' }} onConfirm={() => reject(confirm.req)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmModal title="Permanently delete?" message={`This will permanently remove ${confirm.req.orgName || confirm.req.name || 'this organisation'} and revoke all access. Cannot be undone.`} confirmLabel="Yes, Delete" confirmStyle={{ background:'linear-gradient(135deg,#dc2626,#991b1b)' }} onConfirm={() => deleteOrg(confirm.req)} onCancel={() => setConfirm(null)} />
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'28px' }}>
        {[{ label:'Total', val:requests.length, color:'#a78bfa' }, { label:'Pending', val:requests.filter(r => r.status === 'pending').length, color:'#fcd34d' }, { label:'Approved', val:requests.filter(r => r.status === 'approved').length, color:'#6ee7b7' }, { label:'Rejected', val:requests.filter(r => r.status === 'rejected').length, color:'#fca5a5' }].map(s => (
          <div key={s.label} style={{ borderRadius:'14px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', padding:'16px 20px' }}>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'26px', fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)', marginTop:'2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius:'20px', border:'1px solid rgba(255,255,255,0.08)', background:'#0d1021', overflow:'hidden' }}>
        <div style={{ padding:'20px 28px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
          <div style={{ fontWeight:700, color:'#fff', fontSize:'16px' }}>
            NGO Requests {pending > 0 && <span style={{ marginLeft:'10px', padding:'2px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, background:'rgba(245,158,11,0.2)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' }}>{pending} pending</span>}
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
            {['all','pending','approved','rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding:'5px 14px', borderRadius:'999px', cursor:'pointer', fontSize:'12px', fontWeight:600, border:'none', background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', color: filter === f ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={load} style={{ padding:'7px 16px', borderRadius:'8px', cursor:'pointer', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#fff', fontWeight:600, fontSize:'13px' }}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'14px' }}>No requests found.</div>
        ) : shown.map(req => {
          const rv = req.aiVerification;
          const rl = rv?.riskLevel;
          const rs = rl ? RISK_STYLE[rl] : null;
          return (
            <div key={req.id}>
              <div onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'12px', padding:'16px 28px', cursor:'pointer', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.04)', background: expanded === req.id ? 'rgba(255,255,255,0.025)' : 'transparent', transition:'background 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
                  {req.photoURL
                    ? <img src={req.photoURL} alt={req.name} referrerPolicy="no-referrer" style={{ width:'34px', height:'34px', borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                    : <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'#7c3aed', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, color:'#fff', flexShrink:0 }}>{(req.name || req.email || '?')[0].toUpperCase()}</div>
                  }
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'14px', fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.name || '—'}</div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.orgName || req.email}</div>
                  </div>
                </div>
                {rs && (
                  <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 10px', borderRadius:'999px', whiteSpace:'nowrap', background:rs.bg, color:rs.color, border:`1px solid ${rs.border}` }}>
                    {rs.icon} {rl} · {rv.riskScore}
                  </span>
                )}
                <span style={{ fontSize:'11px', fontWeight:700, padding:'4px 10px', borderRadius:'999px', whiteSpace:'nowrap', ...(STATUS_STYLE[req.status] || STATUS_STYLE.pending) }}>
                  {req.status || 'pending'}
                </span>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  {req.status === 'pending'  && <><button onClick={() => approve(req)} style={{ padding:'5px 10px', borderRadius:'7px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.35)', whiteSpace:'nowrap' }}>✓ Approve</button><button onClick={() => setConfirm({ type:'reject', req })} style={{ padding:'5px 10px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)', whiteSpace:'nowrap' }}>✕ Reject</button></>}
                  {req.status === 'approved' && <button onClick={() => setConfirm({ type:'reject', req })} style={{ padding:'5px 10px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)', whiteSpace:'nowrap' }}>Revoke</button>}
                  {req.status === 'rejected' && <button onClick={() => approve(req)} style={{ padding:'5px 10px', borderRadius:'7px', background:'rgba(16,185,129,0.15)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.3)', whiteSpace:'nowrap' }}>Re-approve</button>}
                  <button onClick={() => setConfirm({ type:'delete', req })} style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(127,29,29,0.4)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.25)' }} title="Delete">🗑</button>
                </div>
              </div>

              {expanded === req.id && (
                <div style={{ padding:'24px 28px 28px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.018)', display:'flex', flexDirection:'column', gap:'20px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:'14px' }}>
                    {[
                      { label:'Email',         val: req.email           },
                      { label:'Org type',       val: req.orgType         },
                      { label:'Reg number',     val: req.regNumber       },
                      { label:'PAN number',     val: req.panNumber       },
                      { label:'Year est.',      val: req.yearEstablished },
                      { label:'Location',       val: req.city && req.state ? `${req.city}, ${req.state}` : req.city || req.state },
                      { label:'Contact person', val: req.contactName     },
                      { label:'Phone',          val: req.contactPhone    },
                      { label:'Website',        val: req.website         },
                      { label:'Submitted',      val: req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—' },
                    ].filter(f => f.val).map(f => (
                      <div key={f.label}>
                        <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>{f.label}</div>
                        <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.75)', wordBreak:'break-word' }}>
                          {f.label === 'Website' ? <a href={f.val} target="_blank" rel="noreferrer" style={{ color:'#67e8f9', textDecoration:'none' }}>{f.val}</a> : f.val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {req.description && (
                    <div>
                      <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>Mission / Description</div>
                      <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', lineHeight:1.7, padding:'14px 16px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>{req.description}</div>
                    </div>
                  )}

                  {req.documents && Object.keys(req.documents).some(k => req.documents[k]) ? (
                    <div>
                      <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px' }}>Uploaded Documents</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
                        {Object.entries(req.documents).map(([key, url]) => url && <DocLink key={key} url={url} label={DOC_LABELS[key] || key} />)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>No documents uploaded.</div>
                  )}

                  <div>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'14px' }}>
                      🔍 AI Verification Report
                    </div>
                    <VerificationBreakdown aiVerification={req.aiVerification} regNumber={req.regNumber} orgName={req.orgName} />
                  </div>

                  <div style={{ padding:'16px', borderRadius:'12px', border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:'12px', fontWeight:700, color:'#fca5a5', marginBottom:'3px' }}>Danger Zone</div>
                      <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.3)' }}>Permanently delete this organisation and revoke all access.</div>
                    </div>
                    <button onClick={() => setConfirm({ type:'delete', req })} style={{ padding:'9px 18px', borderRadius:'8px', border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'12px', cursor:'pointer', flexShrink:0 }}>
                      🗑️ Delete Organisation
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── Main AdminPanel ─────────────────────────────────── */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('ngos');
  return (
    <div style={{ padding:'40px 24px', maxWidth:'1100px' }}>
      <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#f59e0b', marginBottom:'8px' }}>Admin</div>
      <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'30px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'6px' }}>Admin Panel</h2>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'14px', marginBottom:'28px' }}>Manage NGO registrations with AI verification reports, review milestone proofs, and control fund releases.</p>
      <div style={{ display:'flex', marginBottom:'32px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        {[{ id:'ngos', label:'🏢 NGO Requests' }, { id:'proofs', label:'📄 Milestone Proofs' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding:'12px 24px', border:'none', cursor:'pointer', fontSize:'14px', fontWeight:600, background:'transparent', color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.35)', borderBottom: activeTab === tab.id ? '2px solid #7c3aed' : '2px solid transparent', marginBottom:'-1px', transition:'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'ngos'   && <NgoRequestsTab />}
      {activeTab === 'proofs' && <ProofsTab />}
    </div>
  );
}