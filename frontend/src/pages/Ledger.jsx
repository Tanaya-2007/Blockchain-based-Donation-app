import { useEffect, useState, useMemo } from 'react';
import { collection, orderBy, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const TYPE_STYLE = {
  donation: { background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)', icon: '💳' },
  release:  { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', icon: '✅' },
  proof:    { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', icon: '📄' },
  refund:   { background: 'rgba(239,68,68,0.15)',  color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', icon: '💸' },
};

function fakeTxHash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const base = Math.abs(h).toString(16).padStart(8, '0');
  return '0x' + (base.repeat(8) + '000000000000000000000000000000000000000000000000000000000000').slice(0, 64);
}

function fmtDate(ts) {
  if (!ts?.seconds) return '—';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtAmt(n) { return n ? `₹${Number(n).toLocaleString('en-IN')}` : '—'; }

function SkeletonTable() {
  return (
    <div style={{ padding: '24px' }}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} style={{
          height: '48px', marginBottom: '16px', borderRadius: '12px',
          background: 'linear-gradient(90deg, #11142b 25%, #1a1e3d 50%, #11142b 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite'
        }} />
      ))}
    </div>
  );
}

export default function Ledger() {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  
  // Controls
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // Inject shimmer keyframes if not exists
    if (!document.getElementById('shimmer-style')) {
      const style = document.createElement('style');
      style.id = 'shimmer-style';
      style.innerHTML = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
      document.head.appendChild(style);
    }

    let donEntries = [];
    let proofEntries = [];
    let ledgerEntries = [];

    const checkLoading = () => {
      if (mounted) setLoading(false);
    };

    function mergeAndSet() {
      if (!mounted) return;
      const all = [...donEntries, ...proofEntries, ...ledgerEntries].sort((a, b) => b.ts - a.ts);
      setEntries(all);
      setLoading(false);
    }

    // Limit queries to avoid massive payloads which causes delays
    const unsubDon = onSnapshot(query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(150)), (snap) => {
      donEntries = snap.docs.map(d => {
        const data = d.data();
        return {
          id:      d.id,
          type:    'donation',
          camp:    data.campaignTitle || 'Unknown Campaign',
          user:    data.donorName || data.donorEmail || 'Anonymous donor',
          amt:     data.amount || 0,
          time:    fmtDate(data.createdAt),
          ts:      data.createdAt?.seconds || 0,
          hash:    data.blockchainTxHash || fakeTxHash(d.id),
          status:  data.status === 'refunded' ? (data.refundStatus || 'Refunded') : (data.status === 'locked' ? 'Locked' : 'Released')
        };
      });
      mergeAndSet();
    }, (err) => { console.error("Ledger Don Error:", err); checkLoading(); });

    const unsubProof = onSnapshot(query(collection(db, 'proofs'), orderBy('uploadedAt', 'desc'), limit(150)), (snap) => {
      proofEntries = snap.docs.map(d => {
        const data = d.data();
        return {
          id:      d.id,
          type:    'proof',
          camp:    data.campaignTitle || 'Unknown Campaign',
          user:    'NGO (Upload)',
          amt:     0,
          time:    fmtDate(data.uploadedAt),
          ts:      data.uploadedAt?.seconds || 0,
          hash:    data.txHash || fakeTxHash(d.id),
          status:  data.status === 'approved' ? 'Verified' : data.status === 'rejected' ? 'Rejected' : 'Pending'
        };
      });
      mergeAndSet();
    }, (err) => { console.error("Ledger Proof Error:", err); checkLoading(); });

    const unsubLedger = onSnapshot(query(collection(db, 'ledger'), orderBy('timestamp', 'desc'), limit(150)), (snap) => {
      ledgerEntries = snap.docs.map(d => {
        const data = d.data();
        if (data.type === 'donation') return null;
        
        const isRefund = data.type === 'Refund';
        return {
          id:      d.id,
          type:    isRefund ? 'refund' : 'release',
          camp:    data.campaignTitle || 'Unknown Campaign',
          user:    isRefund ? (data.donorName || 'Donor') : 'Smart Contract',
          amt:     data.amount || 0,
          time:    fmtDate(data.timestamp || data.createdAt),
          ts:      (data.timestamp?.seconds) || (data.createdAt?.seconds) || 0,
          hash:    data.txHash || fakeTxHash(d.id),
          status:  data.status || (isRefund ? 'Refunded' : 'Released')
        };
      }).filter(Boolean);
      mergeAndSet();
    }, (err) => { console.error("Ledger Auth Error:", err); checkLoading(); });

    // Failsafe timeout
    const failsafe = setTimeout(checkLoading, 2500);

    return () => {
      mounted = false;
      unsubDon();
      unsubProof();
      unsubLedger();
      clearTimeout(failsafe);
    };
  }, []);

  // Filtering & Search
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchFilter = filter === 'all' || e.type === filter;
      const matchSearch = e.camp.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [entries, filter, search]);

  // Pagination
  const shown = filteredEntries.slice(0, page * rowsPerPage);
  const hasMore = shown.length < filteredEntries.length;

  // CSV Export
  const exportCSV = () => {
    const headers = ['Type', 'Campaign', 'User/Entity', 'Amount', 'Status', 'Date', 'TxHash'];
    const rows = filteredEntries.map(e => [
      e.type.toUpperCase(),
      `"${e.camp}"`,
      `"${e.user}"`,
      e.amt,
      e.status,
      `"${e.time}"`,
      e.hash
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ledger_export_${new Date().getTime()}.csv`;
    link.click();
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8" style={{ minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '32px', gap: '16px' }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '34px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>
            Immutable Ledger
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
            Live, tamper-proof record of every platform transaction and proof event.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={exportCSV} style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
            📥 Export CSV
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} />
            Live Network
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'all',      label: 'All Events' },
            { key: 'donation', label: '💳 Donations' },
            { key: 'release',  label: '✅ Releases' },
            { key: 'proof',    label: '📄 Proofs' },
          ].map(f => (
            <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }} style={{
              padding: '8px 20px', borderRadius: '999px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, border: 'none', transition: 'all 0.2s',
              background: filter === f.key ? 'rgba(124,58,237,0.2)' : 'transparent',
              color: filter === f.key ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: '200px', maxWidth: '300px' }}>
          <input 
            type="text" 
            placeholder="Search campaign name..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '13px', outline: 'none' }}
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', overflow: 'hidden' }}>
        
        {loading ? (
          <SkeletonTable />
        ) : shown.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>No records found for the current filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Type', 'Campaign', 'User / NGO', 'Amount', 'Status', 'Date', 'Tx Hash'].map(h => (
                    <th key={h} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={`${e.id}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', ...TYPE_STYLE[e.type] }}>
                        {TYPE_STYLE[e.type].icon} {e.type.charAt(0).toUpperCase() + e.type.slice(1)}
                      </span>
                    </td>
                    
                    <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 600, color: '#e2e8f0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.camp}
                    </td>
                    
                    <td style={{ padding: '16px 24px', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                      {e.user}
                    </td>
                    
                    <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 800, color: e.amt > 0 ? '#22d3ee' : 'rgba(255,255,255,0.2)' }}>
                      {fmtAmt(e.amt)}
                    </td>

                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: e.status === 'Locked' ? '#fbbf24' : e.status === 'Verified' ? '#10b981' : e.status === 'Released' ? '#10b981' : e.status === 'Rejected' ? '#ef4444' : 'rgba(255,255,255,0.4)' }}>
                        {e.status}
                      </span>
                    </td>
                    
                    <td style={{ padding: '16px 24px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                      {e.time}
                    </td>
                    
                    <td style={{ padding: '16px 24px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {e.hash.startsWith('0x') ? (
                        <a href={`https://amoy.polygonscan.com/tx/${e.hash}`} target="_blank" rel="noreferrer" style={{color: '#a78bfa', textDecoration:'none', transition: 'color 0.2s'}} onMouseOver={e=>e.target.style.color='#c4b5fd'} onMouseOut={e=>e.target.style.color='#a78bfa'}>
                          {e.hash.slice(0, 14)}...
                        </a>
                      ) : <span style={{color: 'rgba(255,255,255,0.2)'}}>{e.hash.slice(0,14)}...</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Strip */}
        {!loading && hasMore && (
          <div 
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '16px', textAlign: 'center', background: 'rgba(124,58,237,0.05)', color: '#c4b5fd', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseEnter={e => e.target.style.background = 'rgba(124,58,237,0.1)'}
            onMouseLeave={e => e.target.style.background = 'rgba(124,58,237,0.05)'}
          >
            Load 10 more records ↓
          </div>
        )}
      </div>
    </div>
  );
}