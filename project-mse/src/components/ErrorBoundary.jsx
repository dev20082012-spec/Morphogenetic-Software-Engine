import React from 'react';

/**
 * Structured Error Boundary for Project MSE
 *
 * Prevents catastrophic UI crashes when corrupted ASTs,
 * malformed file models, or unexpected data structures are rendered.
 * Displays a recovery panel allowing the user to return to Overview,
 * restart analysis, or change repositories.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log structured diagnostic data without executing or evaluating user content
    console.error('[MSE ErrorBoundary caught an unhandled exception]:', error, errorInfo);
  }

  handleReturnToOverview = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReturnToOverview === 'function') {
      this.props.onReturnToOverview();
    } else if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleRestartAnalysis = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onRestartAnalysis === 'function') {
      this.props.onRestartAnalysis();
    } else if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleChangeRepository = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onChangeRepository === 'function') {
      this.props.onChangeRepository();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#090d16] p-6 font-mono text-xs text-slate-300">
          <div className="max-w-xl w-full bg-[#111724] border border-[#7f1d1d] rounded-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-[#f87171]">
              <span className="text-base font-bold">[!] COMPONENT ERROR BOUNDARY TRIGGERED</span>
            </div>

            <p className="text-slate-400 text-xs font-sans">
              A view component encountered an unhandled exception while processing repository data.
              The application preserved system state to prevent permanent loss.
            </p>

            <div className="bg-[#090d16] border border-[#263147] rounded p-3 font-mono text-[11px] text-[#fca5a5] overflow-x-auto max-h-40">
              <span className="font-bold block mb-1">Error:</span>
              {this.state.error?.message || 'Unknown render exception'}
            </div>

            {this.state.errorInfo?.componentStack && (
              <details className="text-[10px] text-slate-500">
                <summary className="cursor-pointer hover:text-slate-400">View component stack trace</summary>
                <pre className="mt-2 p-2 bg-[#090d16] border border-[#1e293b] rounded overflow-x-auto max-h-32 text-slate-400">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Recovery Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#1e293b]">
              <button
                onClick={this.handleReturnToOverview}
                className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 font-bold text-xs transition"
              >
                Return to Overview
              </button>

              {this.props.onRestartAnalysis && (
                <button
                  onClick={this.handleRestartAnalysis}
                  className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] font-bold text-xs transition"
                >
                  Restart Analysis
                </button>
              )}

              {this.props.onChangeRepository && (
                <button
                  onClick={this.handleChangeRepository}
                  className="px-3 py-1.5 rounded bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 font-medium text-xs transition"
                >
                  Change Repository
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
