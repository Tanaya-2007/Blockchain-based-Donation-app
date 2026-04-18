import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext } from './AuthContext';

function isAdminEmail(email) {
  const raw  = import.meta.env.VITE_ADMIN_EMAILS || '';
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

function consumeRoleHint() {
  try {
    const h = sessionStorage.getItem('tf_role_hint') || 'donor';
    sessionStorage.removeItem('tf_role_hint');
    return h;
  } catch { return 'donor'; }
}

async function upsertUserDoc(firebaseUser) {
  const ref  = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  // Admin email always wins
  if (isAdminEmail(firebaseUser.email)) {
    const role = 'admin';
    await setDoc(ref, {
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      photoURL: firebaseUser.photoURL || '',
      role,
      lastLoginAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });
    return role;
  }

  if (!snap.exists()) {
    // NEW USER — use the role they selected on the login page
    const hint = consumeRoleHint();               // 'donor' | 'ngo' | 'admin'
    const role = hint === 'ngo' ? 'ngo' : 'donor'; // admin only via email list
    await setDoc(ref, {
      name:        firebaseUser.displayName || '',
      email:       firebaseUser.email       || '',
      photoURL:    firebaseUser.photoURL    || '',
      role,
      createdAt:   serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    return role;
  }

  // RETURNING USER — respect existing role in Firestore
  const role = snap.data()?.role || 'donor';
  await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
  return role;
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [role,    setRole]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      setLoading(true);
      try {
        if (!u) { setUser(null); setRole(null); return; }
        setUser(u);
        const r = await upsertUserDoc(u);
        setRole(r);
      } finally {
        setLoading(false);
      }
    });
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