import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import AssetLibrary from '../../features/assets/components/AssetLibrary';
import FacilitatorMixerPanel from '../../features/audio/components/FacilitatorMixerPanel';
import { FacilitatorSessionControls } from '../../features/session/components/FacilitatorSessionControls';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';
import type { FacilitatorLayoutProps } from './types';

const transitionEase = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: transitionEase },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: transitionEase,
      delay: index * 0.08,
    },
  }),
};

const MOBILE_SECTIONS = [
  { id: 'assets', label: 'Assets' },
  { id: 'mixer', label: 'Audio' },
  { id: 'participants', label: 'Participants' },
] as const;

type MobileSectionId = (typeof MOBILE_SECTIONS)[number]['id'];

interface MobileTabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const MobileTabButton: React.FC<MobileTabButtonProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={
      'rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
      (active
        ? 'border-white/40 bg-white/15 text-white'
        : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white')
    }
  >
    {label}
  </button>
);

export const FacilitatorLayout: React.FC<FacilitatorLayoutProps> = ({ participantPanel, children }) => {
  const [mobileSection, setMobileSection] = React.useState<MobileSectionId>('assets');

  const mobileContent: Record<MobileSectionId, React.ReactNode> = React.useMemo(
    () => ({
      assets: <AssetLibrary />,
      mixer: (
        <div className="flex flex-col gap-6">
          <FacilitatorSessionControls />
          <FacilitatorMixerPanel />
        </div>
      ),
      participants: participantPanel,
    }),
    [participantPanel]
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-slate-950/95 px-4 py-6 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <motion.section variants={cardVariants} custom={0}>
          <GlassCard variant="default" glowColor="blue" className="border-white/5 bg-white/[0.03]">
            <GlassCardHeader className="flex-col gap-3 text-slate-200 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <GlassCardTitle className="text-2xl text-white">Facilitator workflow</GlassCardTitle>
                <GlassCardDescription className="text-sm text-slate-200/80">
                  Follow the flow to prepare assets, bring the mix online, and keep watch over the explorer feed.
                </GlassCardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">1. Load Assets</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">2. Start Audio</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">3. Monitor Explorer</span>
              </div>
            </GlassCardHeader>
            <GlassCardContent className="text-sm text-slate-200">
              Use the session controls to arm the mix, load the manifest, and keep explorers in view without switching context.
            </GlassCardContent>
          </GlassCard>
        </motion.section>

        <div className="lg:hidden">
          <div className="flex flex-wrap gap-2">
            {MOBILE_SECTIONS.map(section => (
              <MobileTabButton
                key={section.id}
                label={section.label}
                active={mobileSection === section.id}
                onClick={() => setMobileSection(section.id)}
              />
            ))}
          </div>
          <motion.div
            key={mobileSection}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35, ease: transitionEase }}
            className="mt-6 flex flex-col gap-6"
          >
            {mobileContent[mobileSection]}
          </motion.div>
        </div>

        <div className="hidden gap-6 lg:grid lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.05fr)]">
          <motion.section variants={cardVariants} custom={1} className="flex flex-col gap-6">
            <AssetLibrary />
          </motion.section>
          <motion.section variants={cardVariants} custom={2} className="flex flex-col gap-6">
            <FacilitatorSessionControls />
            <FacilitatorMixerPanel />
          </motion.section>
          <motion.section variants={cardVariants} custom={3} className="flex flex-col gap-6">
            {participantPanel}
          </motion.section>
        </div>

        {children ? (
          <motion.section variants={cardVariants} custom={4} className="flex flex-col gap-6">
            {children}
          </motion.section>
        ) : null}
      </div>
    </motion.div>
  );
};

export default FacilitatorLayout;
