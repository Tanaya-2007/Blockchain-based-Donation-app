import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext } from './AuthContext';

function isAdminEmail(email) {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

async function upsertUserDoc(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  const adminByEmail = isAdminEmail(firebaseUser.email);

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        name: firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || '',
        role: adminByEmail ? 'admin' : 'donor',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { role: adminByEmail ? 'admin' : 'donor' };
  }

  const data = snap.data() || {};
  const existingRole = data.role || 'donor';
  const nextRole = adminByEmail ? 'admin' : existingRole;
  await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
  if (nextRole !== existingRole) {
    await setDoc(ref, { role: nextRole }, { merge: true });
  }
  return { role: nextRole };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      try {
        if (!u) {
          setUser(null);
          setRole(null);
          return;
        }
        setUser(u);
        const { role: r } = await upsertUserDoc(u);
        setRole(r);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      signInWithGoogle: () => signInWithPopup(auth, googleProvider),
      signOut: () => signOut(auth),
    }),
    [user, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
