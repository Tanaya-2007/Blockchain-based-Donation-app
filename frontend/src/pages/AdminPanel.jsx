import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, getDoc, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { releaseMilestoneFunds } from '../utils/blockchain';

/* ─── constants ───────────────────────────────────────── */
const PAGE_SIZE = 10;

const STATUS_STYLE = {
  pending:  { bg:'rgba(245,158,11,0.15)',  color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' },
  approved: { bg:'rgba(16,185,129,0.15)',  color:'#6ee7b7', border:'1px solid rgba(16,185,129,0.35)' },
  rejected: { bg:'rgba(239,68,68,0.15)',   color:'#fca5a5', border:'1px solid rgba(239,68,68,0.35)'  },
};
const PROOF_STATUS_STYLE = {
  pending_admin_review: { bg:'rgba(245,158,11,0.15)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' },
  approved:             { bg:'rgba(16,185,129,0.15)', color:'#6ee7b7', border:'1px solid rgba(16,185,129,0.35)' },
  rejected:             { bg:'rgba(239,68,68,0.15)',  color:'#fca5a5', border:'1px solid rgba(239,68,68,0.35)'  },
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
const DOC_CLASS_LABEL = {
  correct_document: { label:'✅ Valid Registration Certificate', color:'#6ee7b7' },
  wrong_document:   { label:'⚠️ Wrong Document Type',           color:'#fcd34d' },
  unrelated_image:  { label:'❌ Unrelated Image',               color:'#fca5a5' },
  code_image:       { label:'❌ Code Screenshot',               color:'#fca5a5' },
  screenshot:       { label:'❌ UI/Web Screenshot',             color:'#fca5a5' },
  blank:            { label:'❌ Blank / Unreadable',            color:'#fca5a5' },
  no_image:         { label:'❌ No Image Provided (PDF)',        color:'#fca5a5' },
  api_error:        { label:'⚠️ AI Service Error',             color:'#fcd34d' },
  unknown:          { label:'— Unknown',                        color:'rgba(255,255,255,0.4)' },
};

/* ─── toast hook ──────────────────────────────────────── */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  };
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:'24px', right:'24px', zIndex:1000, display:'flex', flexDirection:'column', gap:'10px', pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding:'12px 20px', borderRadius:'12px', fontSize:'13px', fontWeight:600,
          background: t.type==='success' ? 'rgba(16,185,129,0.96)' : t.type==='error' ? 'rgba(239,68,68,0.96)' : 'rgba(245,158,11,0.96)',
          color:'#fff', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', backdropFilter:'blur(8px)',
          animation:'toastIn 0.3s ease', whiteSpace:'nowrap',
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

/* ─── confirm modal ───────────────────────────────────── */
function ConfirmModal({ title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ width:'100%', maxWidth:'420px', borderRadius:'20px', border:'1px solid rgba(239,68,68,0.3)', background:'#0d1021', padding:'32px', textAlign:'center', animation:'fadeScale 0.2s ease' }}>
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

/* ─── doc link ────────────────────────────────────────── */
function DocLink({ url, label }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'8px', textDecoration:'none', border:'1px solid rgba(124,58,237,0.35)', background:'rgba(124,58,237,0.1)', color:'#c4b5fd', fontSize:'12px', fontWeight:600 }}>
      📄 {label} <span style={{ fontSize:'10px', opacity:0.6 }}>↗</span>
    </a>
  );
}

/* ─── AI Verification Breakdown ───────────────────────── */
function VerificationBreakdown({ aiVerification, regNumber, orgName }) {
  if (!aiVerification) return (
    <div style={{ padding:'12px 14px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', fontSize:'12px', color:'rgba(255,255,255,0.35)', fontStyle:'italic' }}>
      No AI verification data — registered before verification pipeline was added.
    </div>
  );

  const {
    formatChecks, formatScore, aiExtracted, aiScore,
    documentClassification, aiDecision, matchedFields,
    extractedTextSummary, reasoning, nameMatch, regMatch,
    redFlags, red_flags, aiSummary, riskScore, riskLevel, scoreBreakdown,
  } = aiVerification;

  const rs        = RISK_STYLE[riskLevel] || RISK_STYLE.HIGH;
  const allFlags  = redFlags || red_flags || [];
  const classInfo = DOC_CLASS_LABEL[documentClassification || 'unknown'] || DOC_CLASS_LABEL.unknown;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

      {/* Risk hero */}
      <div style={{ padding:'18px', borderRadius:'14px', border:`1px solid ${rs.border}`, background:rs.bg, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:rs.color, marginBottom:'4px' }}>{rs.icon} {riskLevel} RISK</div>
          <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'32px', fontWeight:800, color:rs.color, lineHeight:1 }}>
            {riskScore}<span style={{ fontSize:'14px', fontWeight:400 }}>/100</span>
          </div>
          <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', marginTop:'4px' }}>
            {riskScore >= 65 ? 'Passed AI threshold — admin review required' : 'Failed AI threshold — auto-rejected'}
          </div>
        </div>
        {scoreBreakdown && (
          <div style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'11px' }}>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>AI confidence: <span style={{ color:(scoreBreakdown.aiConfidence||0)>=65?'#6ee7b7':'#fca5a5', fontWeight:700 }}>{scoreBreakdown.aiConfidence ?? aiScore ?? 0}</span>/100</div>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>Format bonus: <span style={{ color:'#a78bfa', fontWeight:700 }}>+{scoreBreakdown.formatBonus||0}</span></div>
            <div style={{ color:'rgba(255,255,255,0.5)' }}>AI decision: <span style={{ color:aiDecision==='manual_review'?'#6ee7b7':'#fca5a5', fontWeight:700 }}>{aiDecision||'—'}</span></div>
          </div>
        )}
      </div>

      {/* Classification */}
      <div style={{ padding:'14px 16px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize:'10px', fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'8px' }}>🔍 Document Classification</div>
        <div style={{ fontSize:'14px', fontWeight:700, color:classInfo.color, marginBottom:'6px' }}>{classInfo.label}</div>
        {(reasoning || aiSummary) && (
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', lineHeight:1.65, padding:'8px 10px', borderRadius:'8px', background:'rgba(255,255,255,0.03)' }}>
            {reasoning || aiSummary}
          </div>
        )}
        {extractedTextSummary && (
          <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', marginTop:'6px' }}>
            <strong style={{ color:'rgba(255,255,255,0.5)' }}>Extracted text:</strong> {extractedTextSummary}
          </div>
        )}
      </div>

      {/* Field matches */}
      {matchedFields && Object.keys(matchedFields).length > 0 && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(124,58,237,0.2)', background:'rgba(124,58,237,0.05)', padding:'14px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#c4b5fd', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>🔗 Field Match Results</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'8px' }}>
            {Object.entries(matchedFields).map(([k, v]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px' }}>
                <span style={{ fontWeight:700, color:v===true?'#34d399':v===false?'#f87171':'rgba(255,255,255,0.3)', flexShrink:0 }}>
                  {v===true?'✓':v===false?'✗':'—'}
                </span>
                <span style={{ color:v===true?'#6ee7b7':v===false?'#fca5a5':'rgba(255,255,255,0.35)' }}>
                  {k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI extracted */}
      {aiExtracted && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(124,58,237,0.15)', background:'rgba(124,58,237,0.03)', padding:'14px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#c4b5fd', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>🤖 AI Extracted vs Declared</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px', marginBottom:'8px' }}>
            {[
              { label:'Org name',   val:aiExtracted.orgName,      match:nameMatch ?? matchedFields?.organization_name },
              { label:'Reg number', val:aiExtracted.regNumber,    match:regMatch  ?? matchedFields?.registration_number },
              { label:'Authority',  val:aiExtracted.authority,    match:null },
              { label:'Reg date',   val:aiExtracted.registeredOn, match:null },
              { label:'Doc type',   val:aiExtracted.documentType, match:null },
            ].filter(f => f.val).map(f => (
              <div key={f.label}>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'2px' }}>{f.label}</div>
                <div style={{ fontSize:'12px', color:f.match===true?'#6ee7b7':f.match===false?'#fca5a5':'rgba(255,255,255,0.7)' }}>
                  {f.match===true?'✓ ':f.match===false?'✗ ':''}{f.val}
                </div>
              </div>
            ))}
          </div>
          {typeof aiScore === 'number' && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', flexShrink:0 }}>AI confidence:</div>
              <div style={{ height:'5px', borderRadius:'5px', flex:1, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${aiScore}%`, borderRadius:'5px', background:aiScore>=65?'#10b981':aiScore>=40?'#f59e0b':'#ef4444' }} />
              </div>
              <div style={{ fontSize:'12px', fontWeight:700, color:aiScore>=65?'#6ee7b7':aiScore>=40?'#fcd34d':'#fca5a5', flexShrink:0 }}>{aiScore}%</div>
            </div>
          )}
        </div>
      )}

      {/* Format checks */}
      {formatChecks?.length > 0 && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)', padding:'14px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>📋 Format Validation ({formatScore}%)</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {formatChecks.map((c, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px' }}>
                <span style={{ fontWeight:700, color:c.pass?'#34d399':'#f87171', flexShrink:0, width:'12px' }}>{c.pass?'✓':'✗'}</span>
                <span style={{ color:'rgba(255,255,255,0.55)', minWidth:'130px' }}>{c.label}</span>
                <span style={{ color:'rgba(255,255,255,0.25)' }}>{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red flags */}
      {allFlags.length > 0 && (
        <div style={{ borderRadius:'12px', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.05)', padding:'14px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:'#fca5a5', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'8px' }}>⚠ Red Flags ({allFlags.length})</div>
          {allFlags.map((f, i) => (
            <div key={i} style={{ display:'flex', gap:'8px', fontSize:'12px', color:'#fca5a5', marginBottom:i<allFlags.length-1?'5px':0 }}>
              <span>•</span>{f}
            </div>
          ))}
        </div>
      )}

      {/* Registry links */}
      <div style={{ borderRadius:'12px', border:'1px solid rgba(34,211,238,0.15)', background:'rgba(34,211,238,0.03)', padding:'14px' }}>
        <div style={{ fontSize:'10px', fontWeight:700, color:'#67e8f9', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'8px' }}>🌐 Manual Registry Check</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          <a href="https://ngodarpan.gov.in/index.php/search/" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'7px 12px', borderRadius:'7px', textDecoration:'none', border:'1px solid rgba(34,211,238,0.3)', background:'rgba(34,211,238,0.08)', color:'#67e8f9', fontSize:'11px', fontWeight:700 }}>
            🏛️ NGO Darpan ↗
          </a>
          <a href="https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'7px 12px', borderRadius:'7px', textDecoration:'none', border:'1px solid rgba(124,58,237,0.3)', background:'rgba(124,58,237,0.08)', color:'#c4b5fd', fontSize:'11px', fontWeight:700 }}>
            🏢 MCA ↗
          </a>
          <a href="https://efiling.incometax.gov.in/eFiling/Services/KnowYourTanLink.html" target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'7px 12px', borderRadius:'7px', textDecoration:'none', border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.08)', color:'#fcd34d', fontSize:'11px', fontWeight:700 }}>
            📄 Income Tax ↗
          </a>
        </div>
        {regNumber && (
          <div style={{ marginTop:'8px', fontSize:'11px', color:'rgba(255,255,255,0.25)' }}>
            Reg#: <strong style={{ color:'rgba(255,255,255,0.55)', userSelect:'all' }}>{regNumber}</strong>
            {orgName && <> · <strong style={{ color:'rgba(255,255,255,0.55)', userSelect:'all' }}>{orgName}</strong></>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Details Sliding Drawer ──────────────────────────── */
function DetailsDrawer({ req, onClose, onApprove, onReject, onDelete, onRevoke, onReapprove, actioning }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, []);

  const rv = req.aiVerification;
  const rl = rv?.riskLevel;
  const rs = rl ? RISK_STYLE[rl] : null;

  const InfoField = ({ label, val, isLink }) => {
    if (!val) return null;
    return (
      <div>
        <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
        <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.8)', wordBreak:'break-word' }}>
          {isLink
            ? <a href={val} target="_blank" rel="noreferrer" style={{ color:'#67e8f9', textDecoration:'none' }}>{val}</a>
            : val}
        </div>
      </div>
    );
  };

  const SectionLabel = ({ title }) => (
    <div style={{ fontSize:'10px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', marginBottom:'14px', paddingBottom:'8px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      {title}
    </div>
  );

  const drawerStyle = isMobile ? {
    position:'fixed', inset:0, zIndex:800, background:'#080e20',
    overflowY:'auto', display:'flex', flexDirection:'column',
    animation:'slideUp 0.3s ease',
  } : {
    position:'fixed', top:0, right:0, bottom:0, zIndex:800,
    width:'min(540px,95vw)', background:'#080e20',
    borderLeft:'1px solid rgba(255,255,255,0.08)',
    overflowY:'auto', display:'flex', flexDirection:'column',
    boxShadow:'-32px 0 80px rgba(0,0,0,0.6)',
    animation:'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)',
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:799, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }} />

      <div style={drawerStyle}>
        {/* Sticky header */}
        <div style={{ padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', flexShrink:0, position:'sticky', top:0, background:'#080e20', zIndex:2, backdropFilter:'blur(12px)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', minWidth:0 }}>
            {req.photoURL
              ? <img src={req.photoURL} alt="" referrerPolicy="no-referrer" style={{ width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
              : <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#0891b2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:800, color:'#fff', flexShrink:0 }}>{(req.name||req.email||'?')[0].toUpperCase()}</div>
            }
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:'15px', fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.orgName||'—'}</div>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.name}</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
            {rs && (
              <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 9px', borderRadius:'999px', background:rs.bg, color:rs.color, border:`1px solid ${rs.border}`, whiteSpace:'nowrap' }}>
                {rs.icon} {rl} · {rv.riskScore}
              </span>
            )}
            <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 10px', borderRadius:'999px', background:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).bg, color:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).color, border:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).border }}>
              {req.status||'pending'}
            </span>
            <button onClick={onClose} style={{ padding:'6px 11px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'18px', lineHeight:1, display:'flex', alignItems:'center' }}>×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ padding:'24px 22px', flex:1, overflowY:'auto' }}>

          {/* Section A — Basic info */}
          <div style={{ marginBottom:'28px' }}>
            <SectionLabel title="A · Basic Information" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
              <InfoField label="Email"          val={req.email} />
              <InfoField label="Phone"          val={req.contactPhone} />
              <InfoField label="City / State"   val={req.city && req.state ? `${req.city}, ${req.state}` : req.city||req.state} />
              <InfoField label="Contact Person" val={req.contactName} />
              <InfoField label="Website"        val={req.website} isLink />
              <InfoField label="Submitted"      val={req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'} />
            </div>
          </div>

          {/* Section B — Registration */}
          <div style={{ marginBottom:'28px' }}>
            <SectionLabel title="B · Registration Details" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
              <InfoField label="Organisation Type" val={req.orgType} />
              <InfoField label="Reg Number"        val={req.regNumber} />
              <InfoField label="PAN Number"        val={req.panNumber} />
              <InfoField label="Year Established"  val={req.yearEstablished} />
            </div>
          </div>

          {/* Section C — Mission */}
          {req.description && (
            <div style={{ marginBottom:'28px' }}>
              <SectionLabel title="C · Mission & Description" />
              <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.6)', lineHeight:1.75, padding:'14px 16px', borderRadius:'12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                {req.description}
              </div>
            </div>
          )}

          {/* Section D — Documents */}
          <div style={{ marginBottom:'28px' }}>
            <SectionLabel title="D · Uploaded Documents" />
            {req.documents && Object.keys(req.documents).some(k => req.documents[k])
              ? <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                  {Object.entries(req.documents).map(([key,url]) => url && <DocLink key={key} url={url} label={DOC_LABELS[key]||key} />)}
                </div>
              : <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>No documents uploaded.</div>
            }
          </div>

          {/* Section E — AI Verification */}
          <div style={{ marginBottom:'28px' }}>
            <SectionLabel title="E · AI Verification Report" />
            <VerificationBreakdown aiVerification={req.aiVerification} regNumber={req.regNumber} orgName={req.orgName} />
          </div>

          {/* Section F — Admin Actions */}
          <div style={{ marginBottom:'16px' }}>
            <SectionLabel title="F · Admin Actions" />
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'16px' }}>
              {req.status === 'pending' && <>
                <button onClick={() => onApprove(req)} disabled={actioning}
                  style={{ padding:'10px 20px', borderRadius:'10px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'13px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.4)', opacity:actioning?0.6:1 }}>
                  ✓ Approve Organisation
                </button>
                <button onClick={() => onReject(req)} disabled={actioning}
                  style={{ padding:'10px 20px', borderRadius:'10px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'13px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.35)', opacity:actioning?0.6:1 }}>
                  ✕ Reject
                </button>
              </>}
              {req.status === 'approved' && (
                <button onClick={() => onRevoke(req)} disabled={actioning}
                  style={{ padding:'10px 20px', borderRadius:'10px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'13px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.35)', opacity:actioning?0.6:1 }}>
                  Revoke Access
                </button>
              )}
              {req.status === 'rejected' && (
                <button onClick={() => onReapprove(req)} disabled={actioning}
                  style={{ padding:'10px 20px', borderRadius:'10px', background:'rgba(16,185,129,0.15)', color:'#6ee7b7', fontWeight:700, fontSize:'13px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.3)', opacity:actioning?0.6:1 }}>
                  ↺ Re-approve
                </button>
              )}
            </div>

            {/* Danger zone */}
            <div style={{ borderRadius:'12px', border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.04)', padding:'16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:'12px', fontWeight:700, color:'#fca5a5', marginBottom:'3px' }}>Danger Zone</div>
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.25)' }}>Permanently delete and revoke all access.</div>
              </div>
              <button onClick={() => onDelete(req)} disabled={actioning}
                style={{ padding:'9px 18px', borderRadius:'9px', border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'12px', cursor:'pointer', flexShrink:0, opacity:actioning?0.6:1 }}>
                🗑️ Delete Organisation
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── NGO Requests Tab ────────────────────────────────── */
function NgoRequestsTab() {
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('pending');
  const [search,    setSearch]    = useState('');
  const [sortBy,    setSortBy]    = useState('newest');
  const [page,      setPage]      = useState(1);
  const [selected,  setSelected]  = useState(new Set());
  const [detail,    setDetail]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [actioning, setActioning] = useState(false);
  const { toasts, show } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'ngoRequests'), orderBy('createdAt','desc')));
      setRequests(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  /* classify AI-rejected separately */
  const isAiRejected = r =>
    r.status === 'rejected' &&
    r.aiVerification?.riskScore != null &&
    r.aiVerification.riskScore < 65;

  /* filtered + sorted list */
  const filtered = requests
    .filter(r => {
      if (filter === 'ai_rejected') return isAiRejected(r);
      if (filter === 'pending')     return r.status === 'pending';
      if (filter === 'approved')    return r.status === 'approved';
      if (filter === 'rejected')    return r.status === 'rejected' && !isAiRejected(r);
      return true; // all
    })
    .filter(r => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (r.orgName||'').toLowerCase().includes(q)
          || (r.name||'').toLowerCase().includes(q)
          || (r.email||'').toLowerCase().includes(q);
    })
    .sort((a,b) => {
      if (sortBy === 'oldest')       return (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0);
      if (sortBy === 'highest_risk') return (b.aiVerification?.riskScore||0) - (a.aiVerification?.riskScore||0);
      return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0);
    });

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore   = filtered.length > paginated.length;

  const counts = {
    all:         requests.length,
    pending:     requests.filter(r => r.status==='pending').length,
    approved:    requests.filter(r => r.status==='approved').length,
    rejected:    requests.filter(r => r.status==='rejected' && !isAiRejected(r)).length,
    ai_rejected: requests.filter(isAiRejected).length,
  };

  /* ── actions ── */
  const approve = async (req) => {
    setActioning(true);
    try {
      await updateDoc(doc(db,'ngoRequests',req.id), { status:'approved' });
      await updateDoc(doc(db,'users',req.uid), { role:'ngo' });
      setRequests(p => p.map(r => r.id===req.id ? {...r,status:'approved'} : r));
      if (detail?.id===req.id) setDetail(d => ({...d,status:'approved'}));
      show(`✓ ${req.orgName||req.name} approved`,'success');
    } catch(e) { show(e.message,'error'); }
    setActioning(false); setConfirm(null);
  };

  const reject = async (req) => {
    setActioning(true);
    try {
      await updateDoc(doc(db,'ngoRequests',req.id), { status:'rejected' });
      if (req.status==='approved') await updateDoc(doc(db,'users',req.uid), { role:'donor' });
      setRequests(p => p.map(r => r.id===req.id ? {...r,status:'rejected'} : r));
      if (detail?.id===req.id) setDetail(d => ({...d,status:'rejected'}));
      show(`✕ ${req.orgName||req.name} rejected`,'warning');
    } catch(e) { show(e.message,'error'); }
    setActioning(false); setConfirm(null);
  };

  const deleteOrg = async (req) => {
    setActioning(true);
    try {
      await deleteDoc(doc(db,'ngoRequests',req.id));
      await updateDoc(doc(db,'users',req.uid), { role:'donor' });
      setRequests(p => p.filter(r => r.id!==req.id));
      if (detail?.id===req.id) setDetail(null);
      show(`🗑 ${req.orgName||req.name} deleted`,'error');
    } catch(e) { show(e.message,'error'); }
    setActioning(false); setConfirm(null);
  };

  /* bulk */
  const bulkApprove = async () => {
    for (const id of selected) { const r=requests.find(x=>x.id===id); if(r) await approve(r); }
    setSelected(new Set()); setConfirm(null);
  };
  const bulkReject = async () => {
    for (const id of selected) { const r=requests.find(x=>x.id===id); if(r) await reject(r); }
    setSelected(new Set()); setConfirm(null);
  };
  const bulkDelete = async () => {
    for (const id of selected) { const r=requests.find(x=>x.id===id); if(r) await deleteOrg(r); }
    setSelected(new Set()); setConfirm(null);
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  };
  const toggleAll = () => setSelected(selected.size===paginated.length&&paginated.length>0 ? new Set() : new Set(paginated.map(r=>r.id)));

  const TABS = [
    { id:'pending',     label:'Pending',     count:counts.pending },
    { id:'approved',    label:'Approved',    count:counts.approved },
    { id:'rejected',    label:'Rejected',    count:counts.rejected },
    { id:'ai_rejected', label:'AI Rejected', count:counts.ai_rejected },
    { id:'all',         label:'All',         count:counts.all },
  ];

  return (
    <>
      <ToastContainer toasts={toasts} />

      {confirm?.type==='reject'      && <ConfirmModal title="Reject this organisation?" message={`Mark "${confirm.req.orgName||confirm.req.name}" as rejected.`} confirmLabel="Yes, Reject" confirmStyle={{background:'rgba(239,68,68,0.85)'}} onConfirm={()=>reject(confirm.req)} onCancel={()=>setConfirm(null)} />}
      {confirm?.type==='delete'      && <ConfirmModal title="Permanently delete?" message={`Remove "${confirm.req.orgName||confirm.req.name}" and revoke all access. Cannot be undone.`} confirmLabel="Yes, Delete" confirmStyle={{background:'linear-gradient(135deg,#dc2626,#991b1b)'}} onConfirm={()=>deleteOrg(confirm.req)} onCancel={()=>setConfirm(null)} />}
      {confirm?.type==='bulk_reject' && <ConfirmModal title={`Reject ${selected.size} organisations?`} message="All selected NGOs will be marked rejected." confirmLabel="Yes, Reject All" confirmStyle={{background:'rgba(239,68,68,0.85)'}} onConfirm={bulkReject} onCancel={()=>setConfirm(null)} />}
      {confirm?.type==='bulk_delete' && <ConfirmModal title={`Delete ${selected.size} organisations?`} message="Permanently removes all selected NGOs. Cannot be undone." confirmLabel="Yes, Delete All" confirmStyle={{background:'linear-gradient(135deg,#dc2626,#991b1b)'}} onConfirm={bulkDelete} onCancel={()=>setConfirm(null)} />}

      {detail && (
        <DetailsDrawer
          req={detail}
          onClose={() => setDetail(null)}
          onApprove={r => approve(r)}
          onReject={r  => setConfirm({ type:'reject', req:r })}
          onDelete={r  => setConfirm({ type:'delete', req:r })}
          onRevoke={r  => setConfirm({ type:'reject', req:r })}
          onReapprove={r => approve(r)}
          actioning={actioning}
        />
      )}

      {/* Analytics cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:'10px', marginBottom:'22px' }}>
        {[
          { label:'Total NGOs',   val:counts.all,         color:'#a78bfa' },
          { label:'Pending',      val:counts.pending,     color:'#fcd34d' },
          { label:'Approved',     val:counts.approved,    color:'#6ee7b7' },
          { label:'Rejected',     val:counts.rejected,    color:'#fca5a5' },
          { label:'AI Rejected',  val:counts.ai_rejected, color:'#f87171' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:'14px', border:'1px solid rgba(255,255,255,0.07)', background:'#0d1021', padding:'14px 16px' }}>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:s.color, lineHeight:1, marginBottom:'4px' }}>{s.val}</div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', marginBottom:'18px', borderBottom:'1px solid rgba(255,255,255,0.07)', overflowX:'auto', gap:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setFilter(t.id); setPage(1); setSelected(new Set()); }}
            style={{ padding:'10px 18px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600, background:'transparent', whiteSpace:'nowrap', transition:'all 0.15s',
              color: filter===t.id ? '#fff' : 'rgba(255,255,255,0.35)',
              borderBottom: filter===t.id ? '2px solid #7c3aed' : '2px solid transparent',
              marginBottom:'-1px',
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft:'6px', padding:'1px 7px', borderRadius:'999px', fontSize:'10px', fontWeight:700, background:filter===t.id?'rgba(124,58,237,0.3)':'rgba(255,255,255,0.07)', color:filter===t.id?'#c4b5fd':'rgba(255,255,255,0.3)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* AI Rejected notice */}
      {filter === 'ai_rejected' && (
        <div style={{ padding:'12px 16px', borderRadius:'12px', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.06)', fontSize:'13px', color:'#fca5a5', marginBottom:'16px', lineHeight:1.6 }}>
          🤖 These submissions were <strong>automatically rejected</strong> by AI (risk score &lt; 65). Admin can still inspect and manually override by approving after review.
        </div>
      )}

      {/* Search + Sort + Refresh */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:'1', minWidth:'200px' }}>
          <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', fontSize:'13px', pointerEvents:'none', opacity:0.5 }}>🔍</span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search org name, applicant, email…"
            style={{ width:'100%', padding:'9px 12px 9px 34px', borderRadius:'10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }}
          />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding:'9px 14px', borderRadius:'10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.7)', fontSize:'13px', outline:'none', cursor:'pointer' }}>
          <option value="newest"       style={{background:'#111827'}}>Newest first</option>
          <option value="oldest"       style={{background:'#111827'}}>Oldest first</option>
          <option value="highest_risk" style={{background:'#111827'}}>Highest risk</option>
        </select>
        <button onClick={load} style={{ padding:'9px 16px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.6)', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>↺ Refresh</button>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 16px', borderRadius:'12px', border:'1px solid rgba(124,58,237,0.35)', background:'rgba(124,58,237,0.08)', marginBottom:'14px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', fontWeight:600, color:'#c4b5fd' }}>{selected.size} selected</span>
          <button onClick={bulkApprove} style={{ padding:'6px 14px', borderRadius:'7px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'12px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.35)' }}>✓ Approve All</button>
          <button onClick={() => setConfirm({type:'bulk_reject'})} style={{ padding:'6px 14px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'12px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)' }}>✕ Reject All</button>
          <button onClick={() => setConfirm({type:'bulk_delete'})} style={{ padding:'6px 14px', borderRadius:'7px', background:'rgba(127,29,29,0.4)', color:'#fca5a5', fontWeight:700, fontSize:'12px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.25)' }}>🗑 Delete All</button>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft:'auto', padding:'6px 10px', borderRadius:'7px', border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'rgba(255,255,255,0.35)', cursor:'pointer', fontSize:'12px' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.07)', background:'#0d1021', overflow:'hidden' }}>
        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 90px 90px 130px 110px', gap:'12px', padding:'11px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)', alignItems:'center' }}>
          <input type="checkbox" checked={selected.size===paginated.length&&paginated.length>0} onChange={toggleAll}
            style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#7c3aed' }} />
          {['Organisation','Submitted','AI Score','Status','Actions'].map(h => (
            <div key={h} style={{ fontSize:'10px', fontWeight:700, color:'rgba(255,255,255,0.22)', textTransform:'uppercase', letterSpacing:'1px' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:'14px' }}>Loading…</div>
        ) : paginated.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center' }}>
            <div style={{ fontSize:'36px', marginBottom:'12px' }}>🔍</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'14px' }}>No organisations found.</div>
          </div>
        ) : paginated.map(req => {
          const rv          = req.aiVerification;
          const rl          = rv?.riskLevel;
          const rs          = rl ? RISK_STYLE[rl] : null;
          const sel         = selected.has(req.id);
          const aiRejected  = isAiRejected(req);

          return (
            <div key={req.id}
              onClick={() => setDetail(req)}
              style={{
                display:'grid', gridTemplateColumns:'36px 1fr 90px 90px 130px 110px', gap:'12px',
                padding:'13px 20px', borderBottom:'1px solid rgba(255,255,255,0.04)',
                alignItems:'center', cursor:'pointer', transition:'background 0.15s',
                background: sel ? 'rgba(124,58,237,0.07)' : 'transparent',
              }}
              onMouseEnter={e => { if(!sel) e.currentTarget.style.background='rgba(255,255,255,0.025)'; }}
              onMouseLeave={e => { e.currentTarget.style.background=sel?'rgba(124,58,237,0.07)':'transparent'; }}
            >
              {/* Checkbox */}
              <div onClick={e => toggleSelect(req.id, e)}>
                <input type="checkbox" checked={sel} readOnly style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#7c3aed' }} />
              </div>

              {/* Org + applicant */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
                {req.photoURL
                  ? <img src={req.photoURL} alt="" referrerPolicy="no-referrer" style={{ width:'32px', height:'32px', borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                  : <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#0891b2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800, color:'#fff', flexShrink:0 }}>{(req.name||req.email||'?')[0].toUpperCase()}</div>
                }
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.orgName||'—'}</div>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{req.name||req.email}</div>
                </div>
              </div>

              {/* Date */}
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>
                {req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}
              </div>

              {/* AI Score */}
              <div>
                {rv?.riskScore != null
                  ? <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', whiteSpace:'nowrap', background:rs?.bg||'rgba(255,255,255,0.05)', color:rs?.color||'rgba(255,255,255,0.4)', border:`1px solid ${rs?.border||'rgba(255,255,255,0.1)'}` }}>
                      {rs?.icon} {rv.riskScore}
                    </span>
                  : <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)' }}>—</span>
                }
              </div>

              {/* Status */}
              <div style={{ display:'flex', gap:'5px', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 9px', borderRadius:'999px', whiteSpace:'nowrap',
                  background:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).bg,
                  color:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).color,
                  border:(STATUS_STYLE[req.status]||STATUS_STYLE.pending).border,
                }}>
                  {req.status||'pending'}
                </span>
                {aiRejected && (
                  <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 6px', borderRadius:'999px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.25)', whiteSpace:'nowrap' }}>AI ✕</span>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display:'flex', gap:'5px' }} onClick={e => e.stopPropagation()}>
                {req.status==='pending' && <>
                  <button onClick={() => approve(req)} title="Approve"
                    style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.35)' }}>✓</button>
                  <button onClick={() => setConfirm({type:'reject',req})} title="Reject"
                    style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)' }}>✕</button>
                </>}
                {req.status==='approved' && (
                  <button onClick={() => setConfirm({type:'reject',req})} title="Revoke"
                    style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)' }}>✕</button>
                )}
                {req.status==='rejected' && (
                  <button onClick={() => approve(req)} title="Re-approve"
                    style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(16,185,129,0.15)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.3)' }}>↺</button>
                )}
                {/* View Details */}
                <button onClick={() => setDetail(req)} title="View Details"
                  style={{ padding:'5px 9px', borderRadius:'7px', background:'rgba(124,58,237,0.15)', color:'#c4b5fd', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(124,58,237,0.3)' }}>→</button>
              </div>
            </div>
          );
        })}

        {/* Load More */}
        {hasMore && (
          <div style={{ padding:'16px', textAlign:'center', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={() => setPage(p => p+1)}
              style={{ padding:'10px 28px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.6)', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
              Load More ({filtered.length - paginated.length} remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Proofs Tab ──────────────────────────────────────── */
function ProofsTab() {
  const [proofs,    setProofs]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [actioning, setActioning] = useState(null);
  const { toasts, show } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'proofs'), orderBy('uploadedAt','desc')));
      setProofs(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approveProof = async (proof) => {
    setActioning(proof.id);
    try {
      // 1. Fetch Campaign data to get amount
      const campDoc = await getDoc(doc(db, 'campaigns', proof.campaignId));
      if (!campDoc.exists()) throw new Error('Campaign not found');
      const campData = campDoc.data();
      const milestone = campData.milestones?.[proof.milestoneNo - 1] || {};
      const rawAmount = milestone.amount || (campData.targetAmount / (campData.milestones?.length || 1));

      // 2. Blockchain call
      const ngoWallet = campData.ngoWallet || "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
      const ethAmount = (rawAmount * 0.000001).toFixed(6);
      let bchainTxId = '';
      try {
        bchainTxId = await releaseMilestoneFunds(proof.campaignId, ngoWallet, ethAmount);
      } catch(err) {
        console.error("Blockchain release failed", err);
        throw err;
      }

      // 3. Update Firestore
      await updateDoc(doc(db,'proofs',proof.id), { 
        status:'approved', 
        reviewedAt:new Date(),
        txHash: bchainTxId 
      });
      await updateDoc(doc(db,'campaigns',proof.campaignId), {
        [`milestones.${proof.milestoneNo-1}.status`]:'verified',
        currentMilestone: proof.milestoneNo + 1,
        releasedFunds: increment(rawAmount),
      });

      // 4. Ledger Event
      await addDoc(collection(db, 'ledger'), {
        type: 'milestone_release',
        campaignId: proof.campaignId,
        campaignTitle: proof.campaignTitle || campData.title,
        amount: rawAmount,
        txHash: bchainTxId,
        milestoneNo: proof.milestoneNo,
        createdAt: serverTimestamp(),
      });

      setProofs(p => p.map(x => x.id===proof.id ? {...x,status:'approved'} : x));
      show(`✓ Milestone ${proof.milestoneNo} approved — funds released`,'success');
    } catch(e) { console.error(e); show(e.message,'error'); }
    setActioning(null);
  };

  const rejectProof = async (proof) => {
    setActioning(proof.id);
    try {
      await updateDoc(doc(db,'proofs',proof.id), { status:'rejected', reviewedAt:new Date() });
      setProofs(p => p.map(x => x.id===proof.id ? {...x,status:'rejected'} : x));
      show(`Milestone ${proof.milestoneNo} proof rejected`,'warning');
    } catch(e) { show(e.message,'error'); }
    setActioning(null);
  };

  const shown   = filter==='all' ? proofs : proofs.filter(p => filter==='pending' ? p.status==='pending_admin_review' : p.status===filter);
  const pending = proofs.filter(p => p.status==='pending_admin_review').length;

  return (
    <div>
      <ToastContainer toasts={toasts} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'20px' }}>
        {[
          { label:'Total',    val:proofs.length,                                     color:'#a78bfa' },
          { label:'Pending',  val:pending,                                            color:'#fcd34d' },
          { label:'Approved', val:proofs.filter(p=>p.status==='approved').length,    color:'#6ee7b7' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:'14px', border:'1px solid rgba(255,255,255,0.07)', background:'#0d1021', padding:'14px 18px' }}>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'24px', fontWeight:800, color:s.color, lineHeight:1, marginBottom:'4px' }}>{s.val}</div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius:'18px', border:'1px solid rgba(255,255,255,0.07)', background:'#0d1021', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
          <div style={{ fontWeight:700, color:'#fff', fontSize:'15px' }}>
            Milestone Proofs
            {pending > 0 && <span style={{ marginLeft:'10px', padding:'2px 9px', borderRadius:'999px', fontSize:'11px', fontWeight:700, background:'rgba(245,158,11,0.2)', color:'#fcd34d', border:'1px solid rgba(245,158,11,0.35)' }}>{pending} pending</span>}
          </div>
          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
            {['all','pending','approved','rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'5px 12px', borderRadius:'999px', cursor:'pointer', fontSize:'12px', fontWeight:600, border:'none', background:filter===f?'rgba(255,255,255,0.12)':'transparent', color:filter===f?'#fff':'rgba(255,255,255,0.35)' }}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
            <button onClick={load} style={{ padding:'6px 14px', borderRadius:'8px', cursor:'pointer', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.6)', fontWeight:600, fontSize:'12px' }}>↺</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:'14px' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:'14px' }}>No proofs found.</div>
        ) : shown.map(proof => (
          <div key={proof.id}>
            <div onClick={() => setExpanded(expanded===proof.id ? null : proof.id)}
              style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'12px', padding:'14px 20px', cursor:'pointer', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.04)', background:expanded===proof.id?'rgba(255,255,255,0.02)':'transparent', transition:'background 0.15s' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{proof.campaignTitle||'—'}</div>
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)' }}>{proof.ngoName} · Milestone {proof.milestoneNo}</div>
              </div>
              {typeof proof.aiScore === 'number' && (
                <span style={{ fontSize:'11px', fontWeight:700, padding:'3px 8px', borderRadius:'999px', whiteSpace:'nowrap',
                  ...(proof.aiScore>=65 ? {background:'rgba(245,158,11,0.15)',color:'#fcd34d',border:'1px solid rgba(245,158,11,0.3)'} : {background:'rgba(239,68,68,0.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.3)'}),
                }}>
                  {proof.aiScore>=65?'🗳️':'❌'} {proof.aiScore}%
                </span>
              )}
              <span style={{ fontSize:'11px', fontWeight:700, padding:'4px 9px', borderRadius:'999px', whiteSpace:'nowrap',
                background:(PROOF_STATUS_STYLE[proof.status]||PROOF_STATUS_STYLE.pending_admin_review).bg,
                color:(PROOF_STATUS_STYLE[proof.status]||PROOF_STATUS_STYLE.pending_admin_review).color,
                border:(PROOF_STATUS_STYLE[proof.status]||PROOF_STATUS_STYLE.pending_admin_review).border,
              }}>
                {proof.status==='pending_admin_review'?'Pending':proof.status}
              </span>
              <div style={{ display:'flex', gap:'5px', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                {proof.status==='pending_admin_review' && <>
                  <button onClick={() => approveProof(proof)} disabled={actioning===proof.id}
                    style={{ padding:'6px 10px', borderRadius:'7px', background:'rgba(16,185,129,0.2)', color:'#6ee7b7', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(16,185,129,0.35)' }}>✓ Approve</button>
                  <button onClick={() => rejectProof(proof)} disabled={actioning===proof.id}
                    style={{ padding:'6px 10px', borderRadius:'7px', background:'rgba(239,68,68,0.15)', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', border:'1px solid rgba(239,68,68,0.3)' }}>✕</button>
                </>}
              </div>
            </div>
            {expanded === proof.id && (
              <div style={{ padding:'18px 20px 22px', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.015)' }}>
                {(proof.aiVerification || proof.riskScore || proof.aiScore || proof.aiSummary) ? (
                  <div style={{ marginBottom:'16px' }}>
                    <VerificationBreakdown 
                      aiVerification={proof.aiVerification || proof} 
                      regNumber={proof.campaignId} 
                      orgName={proof.ngoName} 
                    />
                  </div>
                ) : null}
                {proof.fileUrls?.length > 0 && (
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>Documents</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                      {proof.fileUrls.map((url,i) => <DocLink key={i} url={url} label={`Document ${i+1}`} />)}
                    </div>
                  </div>
                )}
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)' }}>
                  Submitted: {proof.uploadedAt?.seconds ? new Date(proof.uploadedAt.seconds*1000).toLocaleString('en-IN') : '—'}
                </div>
                {proof.txHash && (
                  <div style={{ marginTop:'12px', fontSize:'11px', color:'#a78bfa', background:'rgba(124,58,237,0.1)', padding:'10px', borderRadius:'8px', border:'1px solid rgba(124,58,237,0.2)' }}>
                    🔒 <strong>Blockchain Tx:</strong> <span style={{fontFamily:'monospace'}}>{proof.txHash}</span>
                    {proof.txHash.startsWith('0x') && (
                      <a href={`https://amoy.polygonscan.com/tx/${proof.txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft:'8px', color:'#34d399', textDecoration:'none', fontWeight:'bold' }}>Explorer ↗</a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Root AdminPanel ─────────────────────────────────── */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('ngos');
  return (
    <div style={{ padding:'32px 24px', maxWidth:'1100px' }}>
      <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'#f59e0b', marginBottom:'6px' }}>Admin</div>
      <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'28px', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', marginBottom:'4px' }}>Admin Dashboard</h2>
      <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'13px', marginBottom:'24px' }}>
        Manage NGO registrations, AI verification reports, milestone proofs, and fund releases.
      </p>

      <div style={{ display:'flex', marginBottom:'28px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        {[{ id:'ngos', label:'🏢 NGO Requests' }, { id:'proofs', label:'📄 Milestone Proofs' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding:'11px 22px', border:'none', cursor:'pointer', fontSize:'14px', fontWeight:600, background:'transparent', transition:'all 0.15s',
              color: activeTab===tab.id ? '#fff' : 'rgba(255,255,255,0.3)',
              borderBottom: activeTab===tab.id ? '2px solid #7c3aed' : '2px solid transparent',
              marginBottom:'-1px',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'ngos'   && <NgoRequestsTab />}
      {activeTab === 'proofs' && <ProofsTab />}

      <style>{`
        @keyframes slideIn   { from { transform:translateX(100%); opacity:0 } to { transform:translateX(0); opacity:1 } }
        @keyframes slideUp   { from { transform:translateY(30px); opacity:0 } to { transform:translateY(0);  opacity:1 } }
        @keyframes fadeScale { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }
        @keyframes toastIn   { from { transform:translateY(12px); opacity:0 } to { transform:translateY(0); opacity:1 } }
        ::-webkit-scrollbar       { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:999px; }
      `}</style>
    </div>
  );
}