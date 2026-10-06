import { Component, type ReactNode } from 'react';

/**
 * Stops one broken section from blanking the whole page. Shows what went wrong (so it can be
 * reported) and lets the visitor try again.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; what?: string; resetKey?: unknown }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.error('[logsforever] Display error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state">
        <p>Something went wrong showing {this.props.what ?? 'this'}.</p>
        <p className="soft error-detail">{this.state.error.message}</p>
        <button className="button ghost" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
