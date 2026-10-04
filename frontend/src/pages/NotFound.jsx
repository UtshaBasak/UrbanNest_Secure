import React from 'react';
import { Link } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="card p-8 max-w-md w-full text-center animate-slide-up">
        <div className="mx-auto w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
          <SearchX className="w-8 h-8 text-cyan-600" />
        </div>
        <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 mb-1">404</p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Page not found</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-all duration-200"
        >
          <Home className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
