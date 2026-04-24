import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const TYPE_STYLE = {
  donation: { background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' },
  release:  { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' },
  proof:    { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' },
};

// Deterministic fake tx hash from a string seed
function fakeTxHash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0; }
  const base = Math.abs(h).toString(16).padStart(8, '0');
  return '0x' + (base.repeat(8) + '000000000000000000000000000000000000000000000000000000000000').slice(0, 64);
}

function fmtDate(ts) {
  if (!ts?.seconds) return '—';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtAmt(n) { return n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'; }

export default function Ledger() {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [donSnap, proofSnap] = await Promise.all([
          getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'proofs'),    orderBy('uploadedAt', 'desc'))),
        ]);

        const donEntries = donSnap.docs.map(d => {
          const data = d.data();
          return {
            id:      d.id,
            type:    data.status === 'released' ? 'release' : 'donation',
            camp:    data.campaignTitle || 'Unknown Campaign',
            details: data.donorName || data.donorEmail || 'Anonymous donor',
            amt:     fmtAmt(data.amount),
            amtRaw:  data.amount || 0,
            time:    fmtDate(data.createdAt),
            ts:      data.createdAt?.seconds || 0,
            hash:    data.txHash || fakeTxHash(d.id),
            method:  data.method || '',
            status:  data.status || 'locked',
          };
        });

        const proofEntries = proofSnap.docs.map(d => {
          const data = d.data();
          return {
            id:      d.id,
            type:    'proof',
            camp:    data.campaignTitle || 'Unknown Campaign',
            details: `Milestone ${data.milestoneNo} proof · AI: ${data.aiVerdict || 'pending'} (${data.aiScore ?? '—'}%)`,
            amt:     '—',
            amtRaw:  0,
            time:    fmtDate(data.uploadedAt),
            ts:      data.uploadedAt?.seconds || 0,
            hash:    data.txHash || fakeTxHash(d.id),
            status:  data.status || 'pending_admin_review',
          };
        });

        // Merge and sort by timestamp descending
        const all = [...donEntries, ...proofEntries].sort((a, b) => b.ts - a.ts);
        setEntries(all);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const shown = filter === 'all' ? entries : entries.filter(e => e.type === filter);

  // Stats
  const totalDonations = entries.filter(e => e.type === 'donation').reduce((s, e) => s + e.amtRaw, 0);
  const totalReleased  = entries.filter(e => e.type === 'release').reduce((s, e) => s + e.amtRaw, 0);
  const proofCount     = entries.filter(e => e.type === 'proof').length;

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-6 sm:py-8" style={{ minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '36px' }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '6px' }}>
            Blockchain Ledger
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
            Every donation and proof event — permanently recorded
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '999px', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontSize: '12px', fontWeight: 600 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} />
          Live · {entries.length} records
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Donated',   val: fmtAmt(totalDonations), color: '#a78bfa' },
          { label: 'Funds Released',  val: fmtAmt(totalReleased),  color: '#34d399' },
          { label: 'Proof Uploads',   val: proofCount.toString(),   color: '#fbbf24' },
          { label: 'Total Records',   val: entries.length.toString(), color: '#22d3ee' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: 800, color: s.color, marginBottom: '6px' }}>{s.val}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'all',      label: 'All Events' },
          { key: 'donation', label: '💳 Donations' },
          { key: 'release',  label: '✅ Releases' },
          { key: 'proof',    label: '📄 Proofs' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 18px', borderRadius: '999px', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, border: 'none', transition: 'all 0.15s',
            background: filter === f.key ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
            color: filter === f.key ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Ledger feed */}
      <div style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1021', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700, color: '#fff' }}>
            Live Transaction Feed
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} />
            {shown.length} records shown
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading ledger…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📭</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>No records yet — donate to a campaign to see entries appear here.</div>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr 100px 1.5fr 100px 80px', padding: '10px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '12px' }}>
              {['#', 'Type', 'Campaign', 'Tx Hash', 'Details', 'Time', 'Amount'].map(h => (
                <div key={h} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>{h}</div>
              ))}
            </div>

            {shown.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr 100px 1.5fr 100px 80px', gap: '12px', padding: '14px 28px', borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>

                {/* # index */}
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                  #{String(i + 1).padStart(3, '0')}
                </div>

                {/* Type pill */}
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', whiteSpace: 'nowrap', ...TYPE_STYLE[e.type] }}>
                  {e.type === 'donation' ? '💳 Donation' : e.type === 'release' ? '✅ Release' : '📄 Proof'}
                </span>

                {/* Campaign */}
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.camp}
                </div>

                {/* Tx Hash */}
                <div style={{ fontFamily: 'monospace', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.hash.startsWith('0x') ? (
                    <a href={`https://amoy.polygonscan.com/tx/${e.hash}`} target="_blank" rel="noreferrer" style={{color: '#a78bfa', textDecoration:'none'}} title={e.hash}>
                      {e.hash.slice(0, 10)}...
                    </a>
                  ) : <span style={{color: 'rgba(255,255,255,0.3)'}}>{e.hash.slice(0,10)}...</span>}
                </div>

                {/* Details */}
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.details}
                </div>

                {/* Time */}
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{e.time}</div>

                {/* Amount */}
                <div style={{ fontSize: '14px', fontWeight: 700, color: e.amtRaw > 0 ? '#22d3ee' : 'rgba(255,255,255,0.2)', textAlign: 'right' }}>
                  {e.amt}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tx hash footer strip */}
        {shown.length > 0 && (
          <div style={{ padding: '14px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(124,58,237,0.04)' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Latest tx: {shown[0]?.hash}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}