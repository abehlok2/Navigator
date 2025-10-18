import React from 'react';
import { StatusIndicator, type StatusIndicatorStatus } from '../components/ui/status-indicator';
import { Button } from '../components/ui/button';

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
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Left section */}
          <div className="flex items-center gap-4">
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
                className="inline-flex"
              >
                Logout
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-10 pt-6 lg:flex-row">
        {sidebar ? (
          <>
            <aside className="order-1 w-full lg:order-1 lg:w-80 lg:flex-shrink-0 lg:self-start lg:pt-2">
              <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2">
                {sidebar}
              </div>
            </aside>
            <main className="order-2 w-full flex-1 lg:order-2">
              {children}
            </main>
          </>
        ) : (
          <main className="w-full flex-1">
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
