import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Catches render errors (including failed lazy chunk loads) and shows a friendly fallback.
// Pass a `resetKey` (e.g. the current pathname) to clear the error when it changes.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4" role="alert">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Something went wrong</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            An unexpected error occurred while showing this page. Please try reloading.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
