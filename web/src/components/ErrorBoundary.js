'use client';

import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-poe-dark flex items-center justify-center">
          <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.88)] max-w-md mx-auto p-6 text-center">
            <h2 className="text-xl text-poe-gold mb-2">Something went wrong</h2>
            <p className="text-poe-mist mb-4">Please refresh the page and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-poe-gold/20 border border-poe-gold/40 px-6 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-poe-gold transition-colors hover:bg-poe-gold/30"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
