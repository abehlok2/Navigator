import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 text-center text-slate-900">
      <div>
        <h1 className="text-5xl font-semibold">404</h1>
        <p className="mt-2 text-lg text-slate-600">The page you are looking for could not be found.</p>
      </div>
      <Link to="/" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
        Return to dashboard
      </Link>
    </main>
  );
}
