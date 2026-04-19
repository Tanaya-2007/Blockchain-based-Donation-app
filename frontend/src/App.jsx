import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth      from './auth/RequireAuth';

import Navbar         from './components/Navbar';
import Toast          from './components/Toast';
import DonateModal    from './components/DonateModal';

import Home           from './pages/Home';
import Campaigns      from './pages/Campaigns';
import Dashboard      from './pages/Dashboard';
import Ledger         from './pages/Ledger';
import Login          from './pages/Login';
import ProofUpload    from './pages/ProofUpload';
import DonorDashboard from './pages/DonorDashboard';
import NgoDashboard   from './pages/NgoDashboard';
import AdminPanel     from './pages/AdminPanel';
import CreateCampaign from './pages/CreateCampaign';

function AppRoutes() {
  const [toast,      setToast]      = useState({ msg: '', type: '' });
  const [donateOpen, setDonateOpen] = useState(false);
  const [campaign,   setCampaign]   = useState(null);

  const showToast   = (msg, type = 'success') => setToast({ msg, type });
  const openDonate  = (c) => { setCampaign(c); setDonateOpen(true); };
  const closeDonate = () => { setDonateOpen(false); setCampaign(null); };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: -1,
        backgroundColor: '#050812',
        backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(109,40,217,0.16), transparent),
          radial-gradient(ellipse 60% 40% at 80% 100%, rgba(8,145,178,0.09), transparent)`,
      }} />

      <div style={{ minHeight: '100vh', width: '100%' }}>
        <Navbar onDonate={openDonate} />

        <main style={{ paddingTop: '68px' }}>
          <Routes>

            {/* ── PUBLIC ── */}
            <Route path="/"             element={<Home />} />
            <Route path="/campaigns"    element={<Campaigns onDonate={openDonate} />} />
            <Route path="/transparency" element={<Dashboard />} />
            <Route path="/ledger"       element={<Ledger />} />
            <Route path="/login"        element={<Login />} />

            {/* ── ANY LOGGED-IN USER ── */}
            <Route element={<RequireAuth />}>
              <Route path="/account"         element={<DonorDashboard />} />
              <Route path="/ngo"             element={<NgoDashboard />} />
              <Route path="/create-campaign" element={<CreateCampaign />} />
            </Route>

            {/* ── NGO + ADMIN only ── */}
            <Route element={<RequireAuth allowRoles={['ngo', 'admin']} />}>
              <Route path="/proof" element={<ProofUpload onToast={showToast} />} />
            </Route>

            {/* ── ADMIN ONLY ── */}
            <Route element={<RequireAuth allowRoles={['admin']} />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>

            {/* ── wildcard MUST be last ── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {donateOpen && (
          <DonateModal campaign={campaign} onClose={closeDonate} onToast={showToast} />
        )}
        <Toast
          msg={toast.msg} type={toast.type}
          onHide={() => setToast({ msg: '', type: '' })}
        />
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}