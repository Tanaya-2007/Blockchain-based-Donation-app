import React, { useEffect, useState, useMemo } from 'react';
import { collection, orderBy, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

function FilterTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        border: active ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
        background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  );
}

function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ 
          height: '140px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.02)',
          background: 'linear-gradient(90deg, #11142b 25%, #1a1e3d 50%, #11142b 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' 
        }} />
      ))}
    </div>
  );
}

function SkeletonCharts() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
      <div style={{ height: '350px', borderRadius: '24px', background: 'linear-gradient(90deg, #0a0c1a 25%, #11142b 50%, #0a0c1a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', flex: 2 }} />
    </div>
  );
}

export default function Dashboard() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [donations,  setDonations]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [hoveredPie, setHoveredPie] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    // Inject shimmer keyframes
    if (!document.getElementById('shimmer-style')) {
      const style = document.createElement('style');
      style.id = 'shimmer-style';
      style.innerHTML = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
      document.head.appendChild(style);
    }

    // Parallel fetch via optimized listeners
    const unsubCamp = onSnapshot(collection(db, 'campaigns'), (snap) => {
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
    }, (err) => {
      console.error('Campaigns read error (guest mode):', err);
    });

    // Limited query to prevent sequential read delays
    const qDon = query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(300));
    const unsubDon = onSnapshot(qDon, (snap) => {
      if (mounted) {
        setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
        setLoading(false); // Data loaded
      }
    }, (err) => {
      console.error('Donations read error:', err);
      if (mounted) setLoading(false); // Stop spinner even if error (guest mode fallback)
    });

    // Failsafe timeout for guest mode delay
    const failsafe = setTimeout(() => { if (mounted) setLoading(false); }, 2500);

    return () => {
      mounted = false;
      unsubCamp();
      unsubDon();
      clearTimeout(failsafe);
    };
  }, []);

  // ────────────────────────────────────────────────────────
  // CORE BUSINESS LOGIC (100% Data Correctness)
  // ────────────────────────────────────────────────────────
  
  // 1. totalDonated = sum of all campaign raised amounts
  const totalDonated = useMemo(() => campaigns.reduce((sum, c) => sum + (c.raisedAmount || 0), 0), [campaigns]);
  
  // 2. releasedFunds = total amount of approved milestone releases
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

  const trendData = useMemo(() => {
    const dailyMap = {};
    donations.forEach(d => {
      if (!d.createdAt?.seconds) return;
      const date = new Date(d.createdAt.seconds * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      dailyMap[date] = (dailyMap[date] || 0) + (d.amount || 0);
    });
    return Object.keys(dailyMap).map(date => ({ date, amount: dailyMap[date] }));
  }, [donations]);

  const pieData = [
    { name: 'Locked (Safety)', value: totalLocked, color: '#f59e0b' },
    { name: 'Released (Verified)', value: totalReleased, color: '#10b981' }
  ].filter(d => d.value > 0);
  const pieTotal = pieData.reduce((acc, d) => acc + d.value, 0);

  const topNGOs = useMemo(() => {
    return [...campaigns]
      .sort((a, b) => (b.releasedFunds || 0) - (a.releasedFunds || 0))
      .slice(0, 5)
      .map(c => ({
        name: c.title.length > 15 ? c.title.substring(0, 15) + '...' : c.title,
        Released: c.releasedFunds || 0,
        Locked: Math.max(0, (c.raisedAmount || 0) - (c.releasedFunds || 0))
      }));
  }, [campaigns]);

  const [filterTab, setFilterTab] = useState('All');
  
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      const raised = c.raisedAmount || 0;
      const released = c.releasedFunds || 0;
      const locked = Math.max(0, raised - released);

      const hasReleased = released > 0 || c.status === 'released';
      // If there are locked funds, it has pending releases. 
      // If no funds raised yet, it's also pending (not released).
      const hasPending = locked > 0 || raised === 0;

      if (filterTab === 'Released') return hasReleased;
      if (filterTab === 'Pending') return hasPending;
      return true; // 'All'
    });
  }, [campaigns, filterTab]);

  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;
  
  const STATS = [
    { label: 'Total Donated',        val: fmt(totalDonated),      icon: '💎', color: '#a78bfa' },
    { label: 'Released to NGO',      val: fmt(totalReleased),     icon: '✅', color: '#34d399' },
    { label: 'Locked Safety Funds',  val: fmt(totalLocked),       icon: '🔒', color: '#fbbf24' },
    { label: 'Milestones Completed', val: milestonesCompleted,    icon: '🏆', color: '#22d3ee' },
    { label: 'Active Donors',        val: activeDonors,           icon: '👥', color: '#f472b6' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8" style={{ minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '36px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '34px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          Real-Time Transparency
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
          Every rupee tracked cryptographically. Funds are securely locked until milestones are verified by AI & Admins.
        </p>
      </div>

      {loading ? (
        <>
          <SkeletonCards />
          <SkeletonCharts />
        </>
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

          {/* AREA CHART */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px', width: '100%' }}>
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
          </div>

          {/* TWO NEW CHARTS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
            
            {/* Top Network Beneficiaries */}
            <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px' }}>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Top Network Beneficiaries</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '4px' }}>NGOs ranked by verified milestone releases</p>
              </div>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topNGOs} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={12} tickFormatter={n => '₹'+(n/1000)+'k'} />
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

            {/* Ecosystem Overview Donut */}
            <div style={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0c1a', padding: '28px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Ecosystem Overview</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '4px' }}>Complete platform health and fund statuses</p>
              </div>
              <div style={{ flex: 1, position: 'relative', height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      animationDuration={1000}
                      onMouseEnter={(_, index) => setHoveredPie(index)}
                      onMouseLeave={() => setHoveredPie(null)}
                    >
                      {pieData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          style={{
                            filter: hoveredPie === index ? `drop-shadow(0 0 10px ${entry.color})` : 'none',
                            transform: hoveredPie === index ? 'scale(1.05)' : 'scale(1)',
                            transformOrigin: 'center',
                            transition: 'all 0.3s ease'
                          }} 
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ background: '#0a0c1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ fontWeight: 800, color: '#fff' }}
                      formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                   <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Vault</div>
                   <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', marginTop: '4px' }}>₹{(pieTotal/1000).toFixed(0)}k+</div>
                </div>
              </div>
            </div>

          </div>

          {/* ──────────────────────────────────────────────────────── */}
          {/* CAMPAIGN TRANSPARENCY BOXES */}
          {/* ──────────────────────────────────────────────────────── */}
          <div style={{ marginTop: '48px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: 800, color: '#fff' }}>Campaign Tracking</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginTop: '4px' }}>Real-time status of locked vs released funds</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <FilterTab label="All" active={filterTab === 'All'} onClick={() => setFilterTab('All')} />
                <FilterTab label="Released" active={filterTab === 'Released'} onClick={() => setFilterTab('Released')} />
                <FilterTab label="Pending" active={filterTab === 'Pending'} onClick={() => setFilterTab('Pending')} />
              </div>
            </div>

            {filteredCampaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>
                No campaigns match this filter.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {filteredCampaigns.map(c => {
                  const raised = c.raisedAmount || 0;
                  const released = c.releasedFunds || 0;
                  const target = c.targetAmount || 0;
                  const locked = Math.max(0, raised - released);

                  return (
                    <div key={c.id} style={{
                      borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)',
                      background: '#0a0c1a', padding: '24px', position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
                        {c.category || 'Campaign'}
                      </div>
                      <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '16px', lineHeight: 1.3 }}>{c.title}</h4>
                      
                      {/* Progress Bar */}
                      <div style={{ height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', marginBottom: '16px', display: 'flex', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (released/target)*100 || 0)}%`, background: '#10b981' }} />
                        <div style={{ height: '100%', width: `${Math.min(100, (locked/target)*100 || 0)}%`, background: '#fbbf24' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>₹{released.toLocaleString('en-IN')}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Locked (Safety)</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>₹{locked.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}