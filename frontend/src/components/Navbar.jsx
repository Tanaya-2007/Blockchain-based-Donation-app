import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function Navbar({ onDonate }) {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const links = useMemo(() => {
    const base = [
      { label: 'Home', to: '/' },
      { label: 'Campaigns', to: '/campaigns' },
      { label: 'Transparency', to: '/transparency' },
      { label: 'Ledger', to: '/ledger' },
    ];
    if (user) base.push({ label: 'Proof Upload', to: '/proof' });
    if (role === 'ngo') base.push({ label: 'NGO', to: '/ngo' });
    if (role === 'admin') base.push({ label: 'Admin', to: '/admin' });
    return base;
  }, [user, role]);

  return (
    <nav className="fixed inset-x-0 top-0 z-[100] h-[68px] border-b border-white/5 bg-[rgba(8,10,22,0.92)] backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <button
          className="inline-flex items-center gap-2.5 bg-transparent p-0 text-left"
          onClick={() => { setOpen(false); nav('/'); }}
          aria-label="Go to home"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-700 to-cyan-600 text-base">
            💎
          </span>
          <span className="whitespace-nowrap font-display text-[18px] font-extrabold tracking-[-0.3px] text-white">
            Transparent<span className="text-violet-500">Fund</span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Desktop links */}
          <div className="hidden items-center gap-1 lg:flex lg:mr-2">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
                  ].join(' ')
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2.5 lg:flex">
            <button
              onClick={() => onDonate(null)}
              className="inline-flex items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-600 to-violet-800 px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(124,58,237,0.35)]"
            >
              Donate Now
            </button>

            {!user ? (
              <NavLink
                to="/login"
                className="inline-flex items-center justify-center rounded-[10px] border border-white/15 bg-white/5 px-4 py-2.5 text-[13px] font-bold text-white/90"
              >
                Sign in
              </NavLink>
            ) : (
              <button
                onClick={() => signOut()}
                className="inline-flex items-center justify-center rounded-[10px] border border-white/15 bg-white/5 px-4 py-2.5 text-[13px] font-bold text-white/90"
              >
                Sign out
              </button>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 lg:hidden"
            aria-label="Open menu"
            aria-expanded={open ? 'true' : 'false'}
            onClick={() => setOpen((v) => !v)}
          >
            <div className="grid gap-1.5">
              <span className="block h-0.5 w-5 rounded bg-white/90" />
              <span className="block h-0.5 w-5 rounded bg-white/90" />
              <span className="block h-0.5 w-5 rounded bg-white/90" />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="fixed inset-0 z-[120] bg-[#050812] lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute right-3 top-[78px] w-[min(92vw,360px)] overflow-hidden rounded-[18px] border border-white/10 bg-[#0d1021] shadow-[0_18px_60px_rgba(0,0,0,0.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid gap-0.5 p-2.5">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    [
                      'rounded-xl px-3 py-3 text-sm font-semibold transition',
                      isActive ? 'bg-violet-600/20 text-violet-100' : 'text-white/70 hover:bg-white/5 hover:text-white',
                    ].join(' ')
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </div>

            <div className="grid gap-2.5 border-t border-white/10 p-3">
              <button
                onClick={() => { setOpen(false); onDonate(null); }}
                className="inline-flex w-full items-center justify-center rounded-[12px] bg-gradient-to-br from-violet-600 to-violet-800 px-4 py-3 text-[13px] font-bold text-white"
              >
                Donate Now
              </button>
              {!user ? (
                <NavLink
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex w-full items-center justify-center rounded-[12px] border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-bold text-white/90"
                >
                  Sign in
                </NavLink>
              ) : (
                <button
                  onClick={() => { setOpen(false); signOut(); }}
                  className="inline-flex w-full items-center justify-center rounded-[12px] border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-bold text-white/90"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}