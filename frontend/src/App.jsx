import { useState } from 'react';
import Navbar      from './components/Navbar';
import Toast       from './components/Toast';
import DonateModal from './components/DonateModal';
import Home        from './pages/Home';
import Campaigns   from './pages/Campaigns';
import ProofUpload from './pages/ProofUpload';
import Dashboard   from './pages/Dashboard';
import Ledger      from './pages/Ledger';

export default function App() {
  const [page,       setPage]       = useState('home');
  const [toast,      setToast]      = useState({ msg:'', type:'' });
  const [donateOpen, setDonateOpen] = useState(false);
  const [campaign,   setCampaign]   = useState(null);

  const showToast = (msg, type='success') => setToast({ msg, type });
  const openDonate = (c) => { setCampaign(c); setDonateOpen(true); };
  const closeDonate = () => { setDonateOpen(false); setCampaign(null); };

  return (
    <div className="min-h-screen" style={{ background:'#050812', fontFamily:"'Playfair Display',serif" }}>
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none z-0"
           style={{ background:'radial-gradient(ellipse 80% 50% at 50% -20%,rgba(109,40,217,0.12),transparent),radial-gradient(ellipse 60% 40% at 80% 80%,rgba(8,145,178,0.06),transparent)' }} />

      <Navbar page={page} setPage={setPage} onDonate={openDonate} />

      <main className="pt-16 relative z-10">
        {page === 'home'       && <Home       setPage={setPage} onDonate={openDonate} />}
        {page === 'campaigns'  && <Campaigns  onDonate={openDonate} />}
        {page === 'proof'      && <ProofUpload onToast={showToast} />}
        {page === 'dashboard'  && <Dashboard  />}
        {page === 'ledger'     && <Ledger     />}
      </main>

      {donateOpen && <DonateModal campaign={campaign} onClose={closeDonate} onToast={showToast} />}
      <Toast msg={toast.msg} type={toast.type} onHide={() => setToast({ msg:'', type:'' })} />
    </div>
  );
}