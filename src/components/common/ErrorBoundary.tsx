'use client';
import React, { Component, ReactNode } from 'react';
import { reportError } from '@/lib/error-reporting-service';

/* ===== Error Boundary =====
 * Captura errores de renderizado en componentes hijos.
 * Muestra una UI de fallback en vez de romper toda la app.
 * Reporta errores a Firestore cuando error_reporting flag está activo.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  screenName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Archii] ErrorBoundary caught:', error, errorInfo);

    // Report to Firestore (non-blocking)
    reportError({
      message: error.message,
      stack: error.stack || undefined,
      componentStack: errorInfo.componentStack || undefined,
      screen: this.props.screenName,
    }).catch(() => {});
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-10 text-center min-h-[200px]">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4 text-2xl">
            ⚠️
          </div>
          <h3 className="text-[15px] font-semibold mb-2 text-foreground">
            Error al cargar
          </h3>
          <p className="text-xs text-muted-foreground max-w-[300px] mb-4">
            {this.state.error?.message || 'Algo salió mal. Intenta de nuevo.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-5 py-2 rounded-[10px] border border-[var(--af-accent)]/30 bg-[var(--af-accent)]/10 text-[var(--af-accent)] text-[13px] font-medium cursor-pointer hover:bg-[var(--af-accent)]/20 transition-colors"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
