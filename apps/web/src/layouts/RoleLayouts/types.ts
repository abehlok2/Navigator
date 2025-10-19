import * as React from 'react';

export interface RoleLayoutProps {
  children?: React.ReactNode;
}

export interface FacilitatorLayoutProps extends RoleLayoutProps {
  participantPanel: React.ReactNode;
}

export interface ExplorerLayoutProps extends RoleLayoutProps {}

export interface ListenerLayoutProps extends RoleLayoutProps {
  facilitatorName: string | null;
}
