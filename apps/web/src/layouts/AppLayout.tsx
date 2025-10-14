import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  GlassCard,
  GlassCardContent,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardFooter,
} from '../components/ui/glass-card';
import { StatusIndicator, type StatusIndicatorStatus } from '../components/ui/status-indicator';
import { cn } from '../lib/utils';

export interface AppUserSummary {
  name: string;
  role: string;
  avatarUrl?: string;
}

export interface ConnectionStateSummary {
  indicatorStatus: StatusIndicatorStatus;
  label?: React.ReactNode;
  ariaLabel?: string;
}

export interface AppLayoutProps {
  /**
   * Main page content rendered inside the layout.
   */
  children: React.ReactNode;
  /**
   * The authenticated user that should be shown in the header.
   */
  user: AppUserSummary;
  /**
   * Connection metadata for the active session.
   */
  connection: ConnectionStateSummary;
  /**
   * Optional application title displayed next to the logo.
   */
  title?: string;
  /**
   * Optional subtitle or environment descriptor.
   */
  subtitle?: string;
  /**
   * Optional sidebar navigation rendered inside a glass panel.
   */
  sidebar?: React.ReactNode;
  /**
   * Callback invoked when the logout button is clicked.
   */
  onLogout?: () => void;
  /**
   * Optional footer content. If omitted a default system status message is shown.
   */
  footerInfo?: React.ReactNode;
}

const sidebarVariants = {
  hidden: { x: '-12%', opacity: 0 },
  visible: { x: '0%', opacity: 1 },
  exit: { x: '-12%', opacity: 0 },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  user,
  connection,
  title = 'Navigator Control Center',
  subtitle = 'Real-time mission dashboard',
  sidebar,
  onLogout,
  footerInfo,
}) => {
  const hasSidebar = Boolean(sidebar);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const userInitials = React.useMemo(() => {
    return user.name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || 'NV';
  }, [user.name]);

  React.useEffect(() => {
    if (!hasSidebar) {
      setIsSidebarOpen(false);
    }
  }, [hasSidebar]);

  React.useEffect(() => {
    if (isSidebarOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
    return undefined;
  }, [isSidebarOpen]);

  const handleToggleSidebar = () => setIsSidebarOpen(open => !open);
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.12),transparent_55%)]">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <GlassCard
            variant="elevated"
            className="backdrop-saturate-150"
          >
            <GlassCardHeader className="gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-sky-400/60 via-blue-500/40 to-indigo-500/30 text-lg font-semibold text-white shadow-[0_20px_45px_-20px_rgba(59,130,246,0.8)] sm:h-14 sm:w-14">
                  <span className="drop-shadow">NV</span>
                </div>
                <div className="flex flex-col gap-1">
                  <GlassCardTitle className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    {title}
                  </GlassCardTitle>
                  <GlassCardDescription className="text-sm text-slate-300 sm:text-base">
                    {subtitle}
                  </GlassCardDescription>
                </div>
              </div>
              {hasSidebar ? (
                <motion.button
                  type="button"
                  onClick={handleToggleSidebar}
                  aria-expanded={isSidebarOpen}
                  aria-controls="app-layout-sidebar"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 lg:hidden"
                  whileTap={{ scale: 0.94 }}
                >
                  <span className="sr-only">Toggle navigation</span>
                  {isSidebarOpen ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </motion.button>
              ) : null}
            </GlassCardHeader>
            <GlassCardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 rounded-full border border-white/5 bg-white/5 px-4 py-2 shadow-inner">
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={`${user.name} avatar`}
                      className="h-10 w-10 rounded-full border border-white/20 object-cover shadow-lg"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-white shadow-inner">
                      {userInitials}
                    </div>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium text-white sm:text-base">{user.name}</span>
                    <span className="text-xs text-slate-300 sm:text-sm">Authenticated session</span>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200 shadow-[0_10px_30px_-20px_rgba(16,185,129,0.8)]">
                  {user.role}
                </span>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-4">
                <StatusIndicator
                  status={connection.indicatorStatus}
                  label={connection.label}
                  ariaLabel={connection.ariaLabel}
                  size="md"
                  className="min-w-[200px] rounded-full border border-white/10 bg-white/5 px-3 py-2"
                />
                <motion.button
                  type="button"
                  onClick={handleLogout}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 shadow-[0_12px_30px_-18px_rgba(244,63,94,0.6)] transition',
                    'bg-gradient-to-r from-rose-500/80 via-rose-500/70 to-rose-500/60 hover:from-rose-500 hover:via-rose-500 hover:to-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
                  )}
                  whileTap={{ scale: 0.96 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                  <span>Logout</span>
                </motion.button>
              </div>
            </GlassCardContent>
          </GlassCard>

          <div className="flex flex-1 flex-col gap-6 lg:flex-row">
            {hasSidebar ? (
              <>
                <div className="hidden w-full shrink-0 lg:block lg:w-80 xl:w-96">
                  <GlassCard
                    id="app-layout-sidebar"
                    variant="elevated"
                    className="h-full min-h-[18rem] backdrop-saturate-150"
                  >
                    <GlassCardHeader className="border-white/5">
                      <GlassCardTitle className="text-xl text-white">Navigation</GlassCardTitle>
                      <GlassCardDescription className="text-slate-300">
                        Quick access to mission modules
                      </GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent className="h-full space-y-4 overflow-y-auto pr-1">
                      {sidebar}
                    </GlassCardContent>
                  </GlassCard>
                </div>

                <AnimatePresence initial={false}>
                  {isSidebarOpen ? (
                    <motion.div
                      key="mobile-sidebar"
                      className="fixed inset-0 z-40 flex items-start justify-start gap-0 bg-slate-950/70 px-4 py-6 backdrop-blur-sm lg:hidden"
                      variants={overlayVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.2 }}
                    >
                      <motion.aside
                        id="app-layout-sidebar"
                        className="w-full max-w-xs"
                        variants={sidebarVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <GlassCard variant="elevated" className="h-full min-h-[18rem] backdrop-saturate-150">
                          <GlassCardHeader className="flex-row items-center justify-between border-white/5">
                            <GlassCardTitle className="text-lg text-white">Navigation</GlassCardTitle>
                            <motion.button
                              type="button"
                              onClick={handleToggleSidebar}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                              whileTap={{ scale: 0.92 }}
                            >
                              <span className="sr-only">Close navigation</span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                              >
                                <path d="M6 6l12 12M18 6L6 18" />
                              </svg>
                            </motion.button>
                          </GlassCardHeader>
                          <GlassCardContent className="space-y-4 overflow-y-auto pr-1">
                            {sidebar}
                          </GlassCardContent>
                        </GlassCard>
                      </motion.aside>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </>
            ) : null}

            <motion.main
              className={cn(
                'flex-1',
                hasSidebar ? 'lg:pl-0' : ''
              )}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassCard variant="elevated" className="flex h-full flex-col backdrop-saturate-150">
                <GlassCardContent className="flex-1 overflow-y-auto pr-1">
                  <div className="flex h-full flex-col gap-6 pb-2">
                    {children}
                  </div>
                </GlassCardContent>
              </GlassCard>
            </motion.main>
          </div>

          <GlassCard variant="default" className="backdrop-saturate-150">
            <GlassCardFooter className="flex-col gap-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.9)]" />
                <span>{footerInfo ?? 'Systems nominal • Synced less than a minute ago'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                <span>Build 1.3.7</span>
                <span>•</span>
                <span>Navigator Platform</span>
                <span>•</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </GlassCardFooter>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

AppLayout.displayName = 'AppLayout';

export default AppLayout;
