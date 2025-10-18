import React, { useState } from 'react';
import { StatusIndicator, type StatusIndicatorStatus } from '../components/ui/status-indicator';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

export interface AppLayoutProps {
  user: {
    name: string;
    role: string;
  };
  connection: {
    indicatorStatus: StatusIndicatorStatus;
    label: string;
    ariaLabel: string;
  };
  title?: string;
  subtitle?: string;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  onLogout?: () => void;
}

export default function AppLayout({
  user,
  connection,
  title,
  subtitle,
  sidebar,
  children,
  onLogout,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Left section */}
          <div className="flex items-center gap-4">
            {sidebar && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
                aria-label="Toggle sidebar"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            )}
            
            <div>
              {title && (
                <h1 className="text-lg font-semibold text-white">{title}</h1>
              )}
              {subtitle && (
                <p className="text-xs text-slate-400">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-4">
            <StatusIndicator
              status={connection.indicatorStatus}
              label={connection.label}
              ariaLabel={connection.ariaLabel}
              size="sm"
            />
            
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-medium text-white">{user.name}</div>
                <div className="text-xs text-slate-400">{user.role}</div>
              </div>
            </div>

            {onLogout && (
              <Button
                onClick={onLogout}
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                Logout
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar */}
        {sidebar && (
          <>
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar content */}
            <aside
              className={cn(
                'fixed inset-y-0 left-0 z-50 w-80 transform border-r border-white/10 bg-slate-950 transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
            >
              <div className="h-full overflow-y-auto p-6">
                {/* Mobile close button */}
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="mb-4 rounded-lg p-2 hover:bg-white/10 lg:hidden"
                  aria-label="Close sidebar"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                {sidebar}
              </div>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
