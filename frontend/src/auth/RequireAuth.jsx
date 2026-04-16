import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export default function RequireAuth({ allowRoles }) {
  const { user, role, loading } = useAuth();
  const loc = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  if (Array.isArray(allowRoles) && allowRoles.length > 0) {
    if (!role) return null;
    if (!allowRoles.includes(role)) return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

