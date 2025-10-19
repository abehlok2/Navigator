import React, { useMemo } from 'react';

import { ListenerLayout } from '../../../layouts/RoleLayouts/ListenerLayout';
import type { ParticipantSummary } from '../api';

interface ListenerViewProps {
  participants: ParticipantSummary[];
  participantId: string | null;
  facilitatorId: string | null;
  username?: string | null;
}

export default function ListenerView({ participants, facilitatorId }: ListenerViewProps) {
  const facilitator = useMemo(() => {
    if (facilitatorId) {
      return participants.find(p => p.id === facilitatorId) ?? null;
    }
    return participants.find(p => p.role === 'facilitator') ?? null;
  }, [facilitatorId, participants]);

  const facilitatorName = facilitator?.id ?? 'Facilitator';

  return <ListenerLayout facilitatorName={facilitatorName} />;
}
