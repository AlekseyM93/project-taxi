import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole, roleMatches } from '@/contexts/AuthContext';

type ProtectedRouteProps = {
  children: ReactNode;
  roles?: UserRole[];
  redirectTo?: string;
};

const ProtectedRoute = ({
  children,
  roles,
  redirectTo = '/login',
}: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0) {
    const allowed = roles.some((role) => roleMatches(user.role, role));
    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;

