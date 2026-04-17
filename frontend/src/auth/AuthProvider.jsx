import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext } from './AuthContext';

// ── Helpers ────────────────────────────────────────────────
function isAdminEmail(email) {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || '';
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

function getRoleHint() {
  try {
    const hint = sessionStorage.getItem('tf_role_hint');
    sessionStorage.removeItem('tf_role_hint'); // consume once
    return hint || 'donor';
  } catch {
    return 'donor';
  }
}

async function upsertUserDoc(firebaseUser) {
  const ref  = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  const adminByEmail = isAdminEmail(firebaseUser.email);

  if (!snap.exists()) {
    // ── NEW USER — use role hint from login page ──
    const hint = getRoleHint();

    // Admin email always wins regardless of hint
    // Organization hint → set role to 'pending_ngo' so admin can approve
    // donor hint → donor
    let assignedRole;
    if (adminByEmail) {
      assignedRole = 'admin';
    } else if (hint === 'ngo') {
      assignedRole = 'pending_ngo'; // needs admin approval to become 'ngo'
    } else {
      assignedRole = 'donor';
    }

    await setDoc(ref, {
      name:        firebaseUser.displayName || '',
      email:       firebaseUser.email       || '',
      photoURL:    firebaseUser.photoURL    || '',
      role:        assignedRole,
      roleHint:    hint,
      createdAt:   serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });

    return { role: assignedRole };
  }

  // ── EXISTING USER — role is already set in Firestore ──
  const data         = snap.data() || {};
  const existingRole = data.role   || 'donor';

  // If they were admin by email before but role wasn't set, fix it
  const nextRole = adminByEmail ? 'admin' : existingRole;

  await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
  if (nextRole !== existingRole) {
    await setDoc(ref, { role: nextRole }, { merge: true });
  }

  return { role: nextRole };
}

// ── Provider ───────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [role,    setRole]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setLoading(true);
      try {
        if (!u) { setUser(null); setRole(null); return; }
        setUser(u);
        const { role: r } = await upsertUserDoc(u);
        setRole(r);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({
    user,
    role,
    loading,
    signInWithGoogle: () => signInWithPopup(auth, googleProvider),
    signOut:          () => signOut(auth),
  }), [user, role, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}