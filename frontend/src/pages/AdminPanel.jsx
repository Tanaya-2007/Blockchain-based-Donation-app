import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function AdminPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);

  async function load() {
    setErr('');
    setLoading(true);
    try {
      // Avoid composite indexes + avoid requiring `createdAt` on every doc.
      const q = query(collection(db, 'ngoRequests'), limit(200));
      const snap = await getDocs(q);
      const mapped = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mapped.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setRows(mapped);
    } catch {
      setErr(
        'Failed to load NGO requests. This is usually Firestore security rules (missing read permission for admins).'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(req) {
    // 1) Mark request approved
    await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'approved', decidedAt: serverTimestamp() });
    // 2) Promote user role to NGO
    await updateDoc(doc(db, 'users', req.uid), { role: 'ngo', ngoApprovedAt: serverTimestamp() });
    await load();
  }

  async function reject(req) {
    await updateDoc(doc(db, 'ngoRequests', req.id), { status: 'rejected', decidedAt: serverTimestamp() });
    await load();
  }

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-8">
      <div className="mb-2 text-[11px] font-bold tracking-[2px] text-violet-500 uppercase">Admin</div>
      <h2 className="mb-2 font-display text-[30px] font-extrabold tracking-[-0.5px] text-white">Admin panel</h2>
      <p className="text-white/50">Approve NGO access requests.</p>

      <div className="mt-6 rounded-[18px] border border-white/10 bg-[#0d1021] p-6 text-left">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-white font-semibold">NGO Requests</div>
            <div className="text-white/40 text-[12px] mt-1">
              Pending: <span className="text-white/70 font-semibold">{pending.length}</span>
            </div>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center rounded-[12px] border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-bold text-white/90 hover:bg-white/10 transition"
          >
            Refresh
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-white/40 text-[13px]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="mt-6 text-white/40 text-[13px]">No NGO requests yet.</div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  {['Name', 'Email', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="py-3 pr-4 text-left text-[11px] font-bold tracking-[1.5px] uppercase text-white/40">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[13px] text-white/85">{r.name || '—'}</td>
                    <td className="py-3 pr-4 text-[13px] text-white/60">{r.email || '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold border',
                          r.status === 'pending'
                            ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                            : r.status === 'approved'
                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                            : 'border-red-400/30 bg-red-500/10 text-red-200',
                        ].join(' ')}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approve(r)}
                            className="inline-flex items-center justify-center rounded-[10px] bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => reject(r)}
                            className="inline-flex items-center justify-center rounded-[10px] border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-bold text-white/90 hover:bg-white/10 transition"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-white/35 text-[12px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

