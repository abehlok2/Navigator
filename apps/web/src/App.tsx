import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import SessionPage from './pages/SessionPage';
import NotFoundPage from './pages/NotFoundPage';
import AuthForm from './features/auth/AuthForm';
import { useAuthStore } from './state/auth';
import { useSessionStore, type ConnectionStatus } from './state/session';
import type { StatusIndicatorStatus } from './components/ui/status-indicator';

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div>
              <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
              <p className="mt-2 text-sm text-slate-200/80">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const CONNECTION_STATUS_TEXT: Record<
  ConnectionStatus,
  { status: StatusIndicatorStatus; label: string }
> = {
  connected: { status: 'connected', label: 'Live session link established' },
  connecting: { status: 'connecting', label: 'Negotiating session connection' },
  disconnected: { status: 'disconnected', label: 'No active session connection' },
};

const formatRole = (role: string | null): string =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Guest';

const ProtectedLayout: React.FC = () => {
  const location = useLocation();
  const { token, username, role: authRole, logout } = useAuthStore(state => ({
    token: state.token,
    username: state.username,
    role: state.role,
    logout: state.logout,
  }));
  const { connection, role: sessionRole } = useSessionStore(state => ({
    connection: state.connection,
    role: state.role,
  }));

  if (!token) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  const connectionSummary = CONNECTION_STATUS_TEXT[connection] ?? CONNECTION_STATUS_TEXT.disconnected;
  const displayName = username ?? 'Navigator Operator';
  const displayRole = formatRole(sessionRole ?? authRole);

  return (
    <AppLayout
      user={{ name: displayName, role: displayRole }}
      connection={{
        indicatorStatus: connectionSummary.status,
        label: connectionSummary.label,
        ariaLabel: connectionSummary.label,
      }}
      onLogout={() => {
        void logout();
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </AppLayout>
  );
};

const AppRouter: React.FC = () => {
  const location = useLocation();
  const { token } = useAuthStore(state => ({ token: state.token }));

  return (
    <Routes location={location}>
      <Route path="/auth" element={token ? <Navigate to="/" replace /> : <AuthForm />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="session/:roomId" element={<SessionPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <AppRouter />
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
