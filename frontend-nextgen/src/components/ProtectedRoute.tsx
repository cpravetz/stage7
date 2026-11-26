import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Single route-protection choke point: wraps the Layout route in App.tsx so
 * every app page requires a session token. A stale (expired) token is not
 * detected here on purpose — the guard only answers "is there a session";
 * a token's usability is decided by the 401-recovery cycle in
 * services/api.ts, which refreshes or redirects.
 */
const ProtectedRoute = () => {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
