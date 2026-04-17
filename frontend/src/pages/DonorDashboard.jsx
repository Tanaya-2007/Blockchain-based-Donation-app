import { Link } from 'react-router-dom';
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../auth/useAuth';
import { db } from '../firebase';

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

      {role !== 'ngo' && (
        <div className="mt-6 rounded-[18px] border border-white/10 bg-[#0d1021] p-6 text-left">
          <div className="text-[12px] font-bold tracking-[2px] text-white/40 uppercase mb-2">
            NGO access
          </div>
          <div className="text-white/50 text-[13px] leading-relaxed">
            If you’re an NGO, request access to create and manage donation campaigns. Admin will review your request.
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              className="inline-flex items-center justify-center rounded-[12px] bg-white/5 border border-white/15 px-4 py-3 text-[13px] font-bold text-white/90 hover:bg-white/10 transition"
              onClick={async () => {
                if (!user) return;
                const existing = await getDocs(
                  query(collection(db, 'ngoRequests'), where('uid', '==', user.uid), limit(25))
                );
                const hasPending = existing.docs.some((d) => (d.data()?.status || '') === 'pending');
                if (hasPending) {
                  alert('You already have a pending NGO request.');
                  return;
                }
                await addDoc(collection(db, 'ngoRequests'), {
                  uid: user.uid,
                  email: user.email || '',
                  name: user.displayName || '',
                  status: 'pending',
                  createdAt: serverTimestamp(),
                });
                alert('NGO access request submitted. An admin will review it.');
              }}
            >
              Request NGO access
            </button>
          </div>
          <div className="mt-3 text-[12px] text-white/35">
            Tip: After approval, refresh the page (or sign out/in) to see the NGO dashboard link.
          </div>
        </div>
      )}
    </div>
  );
}

