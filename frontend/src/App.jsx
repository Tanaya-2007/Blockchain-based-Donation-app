import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import DonateModal from './components/DonateModal';
import RequireAuth from './auth/RequireAuth';

import Home from './pages/Home';
import Campaigns from './pages/Campaigns';
import ProofUpload from './pages/ProofUpload';
import Dashboard from './pages/Dashboard';
import Ledger from './pages/Ledger';
import Login from './pages/Login';
import DonorDashboard from './pages/DonorDashboard';
import NgoDashboard from './pages/NgoDashboard';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const [toast,      setToast]      = useState({ msg:'', type:'' });
  const [donateOpen, setDonateOpen] = useState(false);
  const [campaign,   setCampaign]   = useState(null);

  const showToast = (msg, type='success') => setToast({ msg, type });
  const openDonate = (c) => { setCampaign(c); setDonateOpen(true); };
  const closeDonate = () => { setDonateOpen(false); setCampaign(null); };

  return (
    <div className="min-h-screen bg-[#050812] font-display">
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%,rgba(109,40,217,0.12),transparent),radial-gradient(ellipse 60% 40% at 80% 80%,rgba(8,145,178,0.06),transparent)',
        }}
      />

      <Navbar onDonate={openDonate} />

      <main className="relative z-10 pt-[68px]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns" element={<Campaigns onDonate={openDonate} />} />
          <Route path="/transparency" element={<Dashboard />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/proof" element={<ProofUpload onToast={showToast} />} />
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route path="/me" element={<DonorDashboard />} />
          </Route>

          <Route element={<RequireAuth allowRoles={['ngo']} />}>
            <Route path="/ngo" element={<NgoDashboard />} />
          </Route>

          <Route element={<RequireAuth allowRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPanel />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {donateOpen && <DonateModal campaign={campaign} onClose={closeDonate} onToast={showToast} />}
      <Toast msg={toast.msg} type={toast.type} onHide={() => setToast({ msg:'', type:'' })} />
    </div>
  );
}