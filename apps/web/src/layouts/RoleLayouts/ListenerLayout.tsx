import * as React from 'react';
import { motion } from 'framer-motion';

export interface RoleLayoutProps {
  children: React.ReactNode;
}

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] },
  },
};

export const ListenerLayout: React.FC<RoleLayoutProps> = ({ children }) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-slate-950/98 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">{children}</div>
    </motion.div>
  );
};
