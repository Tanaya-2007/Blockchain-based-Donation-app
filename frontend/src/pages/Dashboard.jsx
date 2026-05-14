import React, { useEffect, useState, useMemo } from 'react';
import { collection, orderBy, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

function FilterTab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', borderRadius: '20px', fontSize: '13px',
      fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
      border: active ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
      background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.6)',
    }}>{label}</button>
  );
}

function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '20px', marginBottom: '40px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          height: '140px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.02)',
          background: 'linear-gradient(90deg,#11142b 25%,#1a1e3d 50%,#11142b 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite'
        }} />
      ))}
    </div>
  );
}

function SkeletonCharts() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
      <div style={{
        height: '350px', borderRadius: '24px',
        background: 'linear-gradient(90deg,#0a0c1a 25%,#11142b 50%,#0a0c1a 75%)',
        backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite'
      }} />
    </div>
  );
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState('All');

  useEffect(() => {
    let mounted = true;
    if (!document.getElementById('shimmer-style')) {
      const s = document.createElement('style');
      s.id = 'shimmer-style';
      s.innerHTML = `@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
      document.head.appendChild(s);
    }

    const unsubCamp = onSnapshot(collection(db, 'campaigns'), snap => {
      if (!mounted) return;
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      import('firebase/firestore').then(({ doc, updateDoc }) => {
        list.forEach(c => {
          if ((c.releasedFunds || 0) > (c.raisedAmount || 0)) {
            updateDoc(doc(db, 'campaigns', c.id), { raisedAmount: c.releasedFunds || 0 }).catch(console.error);
            c.raisedAmount = c.releasedFunds || 0;
          }
        });
      });
      setCampaigns(list);
    }, err => console.error('Campaigns error:', err));

    const unsubDon = onSnapshot(
      query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        if (mounted) {
          setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
          setLoading(false);
        }
      },
      err => { console.error('Donations error:', err); if (mounted) setLoading(false); }
    );

    const failsafe = setTimeout(() => { if (mounted) setLoading(false); }, 2500);
    return () => { mounted = false; unsubCamp(); unsubDon(); clearTimeout(failsafe); };
  }, []);

  // ── Core stats ────────────────────────────────────────────────────────
  const totalDonated = useMemo(() => campaigns.reduce((s, c) => s + (c.raisedAmount || 0), 0), [campaigns]);
  const totalReleased = useMemo(() => campaigns.reduce((s, c) => s + (c.releasedFunds || 0), 0), [campaigns]);
  const totalLocked = Math.max(0, totalDonated - totalReleased);
  const activeDonors = useMemo(() => new Set(donations.map(d => d.donorId || d.donorEmail)).size, [donations]);
  const milestonesCompleted = useMemo(() => campaigns.reduce((cnt, c) => {
    if (!c.milestones) return cnt;
    const arr = Array.isArray(c.milestones) ? c.milestones : Object.values(c.milestones);
    return cnt + arr.filter(m => m.status === 'verified').length;
  }, 0), [campaigns]);

  // ── Chart data ────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const map = {};
    donations.forEach(d => {
      if (!d.createdAt?.seconds) return;
      const date = new Date(d.createdAt.seconds * 1000)
        .toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      map[date] = (map[date] || 0) + (d.amount || 0);
    });
    return Object.keys(map).map(date => ({ date, amount: map[date] }));
  }, [donations]);

  const topNGOs = useMemo(() => [...campaigns]
    .sort((a, b) => (b.releasedFunds || 0) - (a.releasedFunds || 0))
    .slice(0, 5)
    .map(c => ({
      name: c.title.length > 15 ? c.title.slice(0, 15) + '…' : c.title,
      Released: c.releasedFunds || 0,
      Locked: Math.max(0, (c.raisedAmount || 0) - (c.releasedFunds || 0)),
    })), [campaigns]);

  const filteredCampaigns = useMemo(() => campaigns.filter(c => {
    const raised = c.raisedAmount || 0;
    const released = c.releasedFunds || 0;
    const locked = Math.max(0, raised - released);
    if (filterTab === 'Released') return released > 0 || c.status === 'released';
    if (filterTab === 'Pending') return locked > 0 || raised === 0;
    return true;
  }), [campaigns, filterTab]);

  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;
  const locPct = totalDonated > 0 ? Math.round((totalLocked / totalDonated) * 100) : 0;
  const relPct = totalDonated > 0 ? Math.round((totalReleased / totalDonated) * 100) : 0;

  const STATS = [
    { label: 'Total Donated', val: fmt(totalDonated), icon: '💎', color: '#a78bfa' },
    { label: 'Released to NGO', val: fmt(totalReleased), icon: '✅', color: '#34d399' },
    { label: 'Locked Safety Funds', val: fmt(totalLocked), icon: '🔒', color: '#fbbf24' },
    { label: 'Milestones Completed', val: milestonesCompleted, icon: '🏆', color: '#22d3ee' },
    { label: 'Active Donors', val: activeDonors, icon: '👥', color: '#f472b6' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8"
      style={{ minHeight: '100vh', fontFamily: 'sans-serif' }}>

      <div style={{ marginBottom: '36px' }}>
        <h2 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '34px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          Real-Time Transparency
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
          Every rupee tracked cryptographically. Funds locked until milestones are verified by AI &amp; Admins.
        </p>
      </div>

      {loading ? (
        <><SkeletonCards /><SkeletonCharts /></>
      ) : (<>

        {/* ── STAT CARDS ───────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '20px', marginBottom: '40px' }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)',
              background: 'linear-gradient(145deg,#11142b,#0a0c1a)', padding: '24px',
              position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
              <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.04 }}>{s.icon}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '32px', fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── AREA CHART ───────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '24px', fontFamily: "'Playfair Display',Georgia,serif" }}>
              Daily Donation Trend
            </div>
            <div style={{ height: '300px' }}>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={n => '₹' + (n / 1000) + 'k'} />
                    <RechartsTooltip
                      contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#c4b5fd', fontWeight: 700 }}
                      formatter={val => [`₹${val.toLocaleString('en-IN')}`, 'Donated']}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#a78bfa" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* ── TWO CHARTS ROW ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(400px,1fr))', gap: '24px', marginBottom: '24px' }}>

          {/* Top Network Beneficiaries */}
          <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Top Network Beneficiaries</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '4px' }}>NGOs ranked by verified milestone releases</p>
            </div>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topNGOs} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal vertical={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={12} tickFormatter={n => '₹' + (n / 1000) + 'k'} />
                  <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.7)" fontSize={12} width={100} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ background: '#0a0c1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ fontWeight: 700 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Locked" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} animationDuration={1000} />
                  <Bar dataKey="Released" stackId="a" fill="#10b981" radius={[0, 8, 8, 0]} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── FUND FLOW OVERVIEW (replaces empty donut) ─────────── */}
          <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Fund Flow Overview</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Live breakdown of every rupee on the platform</p>
            </div>

            {/* Total Raised hero */}
            <div style={{ padding: '20px', borderRadius: '16px', background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(8,145,178,0.1))', border: '1px solid rgba(124,58,237,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Total Raised</div>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '32px', fontWeight: 800, color: '#c4b5fd' }}>{fmt(totalDonated)}</div>
              </div>
              <div style={{ fontSize: '36px', opacity: 0.5 }}>💎</div>
            </div>

            {/* Locked bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                  🔒 Locked (Safety Escrow)
                </span>
                <span style={{ fontWeight: 800, color: '#fbbf24' }}>{fmt(totalLocked)}</span>
              </div>
              <div style={{ height: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '10px', width: `${locPct}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)', transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
                {locPct}% of total — awaiting milestone verification
              </div>
            </div>

            {/* Released bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  ✅ Released (Verified Milestones)
                </span>
                <span style={{ fontWeight: 800, color: '#34d399' }}>{fmt(totalReleased)}</span>
              </div>
              <div style={{ height: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '10px', width: `${relPct}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
                {relPct}% of total — sent to NGOs after proof verified
              </div>
            </div>

            {/* Milestones + Donors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.2)', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '28px', fontWeight: 800, color: '#22d3ee' }}>{milestonesCompleted}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Milestones Verified</div>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.2)', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '28px', fontWeight: 800, color: '#f472b6' }}>{activeDonors}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Active Donors</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── CAMPAIGN TRACKING ────────────────────────────────────── */}
        <div style={{ marginTop: '48px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: '24px', fontWeight: 800, color: '#fff' }}>Campaign Tracking</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '4px' }}>Real-time status of locked vs released funds</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['All', 'Released', 'Pending'].map(t => (
                <FilterTab key={t} label={t} active={filterTab === t} onClick={() => setFilterTab(t)} />
              ))}
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>
              No campaigns match this filter.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '20px' }}>
              {filteredCampaigns.map(c => {
                const raised = c.raisedAmount || 0;
                const released = c.releasedFunds || 0;
                const target = c.targetAmount || 0;
                const locked = Math.max(0, raised - released);
                const relPctC = target > 0 ? Math.min(100, (released / target) * 100) : 0;
                const lockPctC = target > 0 ? Math.min(100, (locked / target) * 100) : 0;

                return (
                  <div key={c.id} style={{ borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
                      {c.category || 'Campaign'}
                    </div>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '16px', lineHeight: 1.3 }}>{c.title}</h4>

                    {/* Progress bar: green=released, amber=locked */}
                    <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', marginBottom: '8px', display: 'flex', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${relPctC}%`, background: '#10b981', transition: 'width 1s' }} />
                      <div style={{ height: '100%', width: `${lockPctC}%`, background: '#fbbf24', transition: 'width 1s' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>
                      Goal: {fmt(target)} · {Math.round(relPctC + lockPctC)}% funded
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>{fmt(released)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Locked</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>{fmt(locked)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </>)}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}