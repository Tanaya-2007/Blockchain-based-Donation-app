import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function Login() {
  const { user, signInWithGoogle } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) nav(loc.state?.from || '/');
  }, [user, nav, loc.state]);

  return (
    <div className="mx-auto w-full max-w-[1126px] px-4 sm:px-6 lg:px-12 py-8">
      <div className="mx-auto max-w-[520px] rounded-[18px] border border-white/10 bg-[#0d1021] p-6 text-left">
        <div className="mb-2 text-[11px] font-bold tracking-[2px] text-violet-500 uppercase">Sign in</div>
        <h2 className="mb-2 font-display text-[30px] font-extrabold tracking-[-0.5px] text-white">Welcome back</h2>
        <p className="mb-5 text-[13px] text-white/50 leading-relaxed">
          Sign in to donate, create campaigns (NGO), or manage approvals (Admin).
        </p>

        <button
          className="inline-flex w-full items-center justify-center rounded-[12px] bg-gradient-to-br from-violet-600 to-violet-800 px-4 py-3 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(124,58,237,0.35)]"
          onClick={async () => {
            setError('');
            try {
              await signInWithGoogle();
            } catch {
              setError('Sign in failed. Please try again.');
            }
          }}
        >
          Continue with Google
        </button>

        {error && (
          <div className="mt-3 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 text-[12px] text-white/45">
          New users default to the <strong>Donor</strong> role.
        </div>
      </div>
    </div>
  );
}

