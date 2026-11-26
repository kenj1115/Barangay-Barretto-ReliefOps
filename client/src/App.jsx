import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { SocketProvider } from './contexts/SocketContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Donations from './pages/Donations';
import ClaimQueue from './pages/ClaimQueue';
import AuditLog from './pages/AuditLog';
import DistributionReports from './pages/DistributionReports';
import ResidentPortal from './pages/ResidentPortal';
import Layout from './components/Layout';

const CashAssistance = lazy(() => import('./pages/CashAssistance'));

function ProtectedRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={user?.role === 'resident' ? '/portal' : '/'} replace />;
  }
  return children;
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === 'resident') {
    return <Navigate to="/portal" replace />;
  }
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'resident' ? '/portal' : '/'} replace />
          ) : (
            <Login />
          )
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <Inventory />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/donations"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <Donations />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cash-assistance"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <Suspense fallback={<p className="font-body text-body-md text-on-surface-variant">Loading cash assistance...</p>}>
                <CashAssistance />
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/claims"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <ClaimQueue />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <DistributionReports />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute roles={['admin', 'staff']}>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal"
        element={
          <ProtectedRoute roles={['resident']}>
            <ResidentPortal />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
