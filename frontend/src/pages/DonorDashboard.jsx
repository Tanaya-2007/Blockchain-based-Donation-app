import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function DonorDashboard() {
  const { user, role } = useAuth();
  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-8">
      <div className="mb-2 text-[11px] font-bold tracking-[2px] text-violet-500 uppercase">Account</div>
      <h2 className="mb-2 font-display text-[30px] font-extrabold tracking-[-0.5px] text-white">Donor dashboard</h2>
      <p className="mb-5 text-white/50">
        Signed in as <strong>{user?.email}</strong> · role: <strong>{role || 'donor'}</strong>
      </p>

      <div className="rounded-[18px] border border-white/10 bg-[#0d1021] p-6 text-left">
        <div className="text-[13px] leading-relaxed text-white/50">
          Next: show your donations, saved campaigns, and receipts here.
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link className="inline-flex items-center justify-center rounded-[12px] bg-gradient-to-br from-violet-600 to-violet-800 px-4 py-3 text-[13px] font-bold text-white" to="/campaigns">
            Browse campaigns
          </Link>
          <Link className="inline-flex items-center justify-center rounded-[12px] border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-bold text-white/90" to="/">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

