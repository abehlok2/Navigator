import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import SessionPage from './pages/SessionPage';
import NotFoundPage from './pages/NotFoundPage';
import AuthForm from './features/auth/AuthForm';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/join/:roomId" element={<DashboardPage />} />
      <Route path="/session/:roomId" element={<SessionPage />} />
      <Route path="/auth" element={<AuthForm />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
