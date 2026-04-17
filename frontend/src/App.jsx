import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';

import Navbar from './components/Navbar';
import Toast from './components/Toast';
import DonateModal from './components/DonateModal';

import Home from './pages/Home';
import Campaigns from './pages/Campaigns';
import Dashboard from './pages/Dashboard';
import Ledger from './pages/Ledger';
import Login from './pages/Login';
import ProofUpload from './pages/ProofUpload';
import DonorDashboard from './pages/DonorDashboard';
import NgoDashboard from './pages/NgoDashboard';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [donateOpen, setDonateOpen] = useState(false);
  const [campaign, setCampaign] = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });
  const openDonate = (c) => { setCampaign(c); setDonateOpen(true); };
  const closeDonate = () => { setDonateOpen(false); setCampaign(null); };

  return (
    <>
      <Navbar onDonate={openDonate} />

      <main style={{ paddingTop: '68px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns" element={<Campaigns onDonate={openDonate} />} />
          <Route path="/transparency" element={<Dashboard />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route path="/account" element={<DonorDashboard />} />
          </Route>

          <Route element={<RequireAuth allowRoles={['ngo', 'admin']} />}>
            <Route path="/proof" element={<ProofUpload onToast={showToast} />} />
            <Route path="/ngo" element={<NgoDashboard />} />
          </Route>

          <Route element={<RequireAuth allowRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPanel />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {donateOpen && (
        <DonateModal
          campaign={campaign}
          onClose={closeDonate}
          onToast={showToast}
        />
      )}

      <Toast
        msg={toast.msg}
        type={toast.type}
        onHide={() => setToast({ msg: '', type: '' })}
      />
    </>
  );
}