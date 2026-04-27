import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, orderBy, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
  PieChart, Pie, Cell
} from 'recharts';

const CAT_COLOR = {
  'Medical / Healthcare': '#a78bfa',
  'Education':            '#22d3ee',
  'Disaster Relief':      '#f87171',
  'Environmental':        '#34d399',
  'Child Welfare':        '#60a5fa',
  'Women Empowerment':    '#f472b6',
  'Animal Welfare':       '#fb923c',
  'Other':                '#94a3b8',
};

const COLORS = ['#7c3aed', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

export default function Dashboard() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [donations,  setDonations]  = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    
    // Real-time listener for campaigns
    const unsubCamp = onSnapshot(collection(db, 'campaigns'), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Real-time listener for donations
    const unsubDon = onSnapshot(query(collection(db, 'donations'), orderBy('createdAt', 'asc')), (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubCamp();
      unsubDon();
    };
  }, []);

  // ────────────────────────────────────────────────────────
  // CORE BUSINESS LOGIC (100% Data Correctness)
  // ────────────────────────────────────────────────────────
  
  // 1. totalDonated = sum of all campaign raised amounts (or all successful donations)
  const totalDonated = useMemo(() => campaigns.reduce((sum, c) => sum + (c.raisedAmount || 0), 0), [campaigns]);
  
  // 2. releasedFunds = total amount of approved milestone releases globally
  const totalReleased = useMemo(() => campaigns.reduce((sum, c) => sum + (c.releasedFunds || 0), 0), [campaigns]);
  
  // 3. lockedFunds = strictly totalDonated - releasedFunds
  const totalLocked = Math.max(0, totalDonated - totalReleased);

  // Other stats
  const activeDonors = useMemo(() => new Set(donations.map(d => d.donorId || d.donorEmail)).size, [donations]);
  const milestonesCompleted = useMemo(() => {
    return campaigns.reduce((count, c) => {
      if (!c.milestones) return count;
      const verified = Array.isArray(c.milestones) 
        ? c.milestones.filter(m => m.status === 'verified').length
        : Object.values(c.milestones).filter(m => m.status === 'verified').length;
      return count + verified;
    }, 0);
  }, [campaigns]);

  // ────────────────────────────────────────────────────────
  // CHART DATA PREPARATION
  // ────────────────────────────────────────────────────────

  // 2. Area Chart (Daily donations trend)
  const trendData = useMemo(() => {
    const dailyMap = {};
    donations.forEach(d => {
      if (!d.createdAt?.seconds) return;
      const date = new Date(d.createdAt.seconds * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      dailyMap[date] = (dailyMap[date] || 0) + (d.amount || 0);
    });
    return Object.keys(dailyMap).map(date => ({ date, amount: dailyMap[date] }));
  }, [donations]);

  // 3. Doughnut Chart (Funds Split)
  const pieData = [
    { name: 'Released (Verified)', value: totalReleased },
    { name: 'Locked (Safety)',     value: totalLocked }
  ].filter(d => d.value > 0);

  // Formatter utilities
  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;
  
  const STATS = [
    { label: 'Total Donated',        val: fmt(totalDonated),      icon: '💎', color: '#a78bfa' },
    { label: 'Released to NGO',      val: fmt(totalReleased),     icon: '✅', color: '#34d399' },
    { label: 'Locked Safety Funds',  val: fmt(totalLocked),       icon: '🔒', color: '#fbbf24' },
    { label: 'Milestones Completed', val: milestonesCompleted,    icon: '🏆', color: '#22d3ee' },
    { label: 'Active Donors',        val: activeDonors,           icon: '👥', color: '#f472b6' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8" style={{ minHeight: '100vh' }}>
      <div style={{ marginBottom: '36px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '34px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          Real-Time Transparency
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
          Every rupee tracked cryptographically. Funds are securely locked until milestones are verified by AI & Admins.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ 
                borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', 
                background: 'linear-gradient(145deg, #11142b, #0a0c1a)', 
                padding: '24px', position: 'relative', overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
              }}>
                <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.04 }}>{s.icon}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', fontWeight: 800, color: s.color }}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr lg:300px', gap: '24px', marginBottom: '24px' }}>
            
            {/* AREA CHART - DONATION TREND */}
            <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px', flex: 2 }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '24px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                Daily Donation Trend
              </div>
              <div style={{ height: '300px', width: '100%' }}>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={n => '₹'+(n/1000)+'k'} />
                      <RechartsTooltip 
                        contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                        itemStyle={{ color: '#c4b5fd', fontWeight: 700 }}
                        formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, 'Donated']}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#a78bfa" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>
                )}
              </div>
            </div>

            {/* PIE CHART - FUNDS SPLIT */}
            <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                Global Funds Split
              </div>
              <div style={{ flex: 1, minHeight: '260px', width: '100%', position: 'relative' }}>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                        <Cell fill="#10b981" /> {/* Released */}
                        <Cell fill="#fbbf24" /> {/* Locked */}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ background: '#111827', border: 'none', borderRadius: '12px', color: '#fff' }}
                        formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, 'Amount']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>No data yet</div>
                )}
                {/* Center text */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>{fmt(totalDonated)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}/> Released</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }}/> Locked</div>
              </div>
            </div>

          </div>

          {/* PROGRESS TIMELINES */}
          <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '24px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              Active Milestone Progress
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {campaigns.filter(c => c.raisedAmount > 0).slice(0, 6).map(c => {
                const milestones = Array.isArray(c.milestones) ? c.milestones : Object.values(c.milestones || {});
                if (!milestones.length) return null;
                
                return (
                  <div key={c.id} style={{ padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {milestones.map((m, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ 
                            width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800,
                            background: m.status === 'verified' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                            color: m.status === 'verified' ? '#10b981' : 'rgba(255,255,255,0.3)',
                            border: `1px solid ${m.status === 'verified' ? '#10b981' : 'rgba(255,255,255,0.1)'}`
                          }}>
                            {m.status === 'verified' ? '✓' : idx + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: m.status === 'verified' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                              {m.title || `Milestone ${idx + 1}`}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                              ₹{(m.amount || 0).toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, color: m.status === 'verified' ? '#10b981' : 'rgba(255,255,255,0.2)' }}>
                            {m.status === 'verified' ? 'Released' : 'Locked'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}