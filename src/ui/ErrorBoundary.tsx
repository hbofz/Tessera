/**
 * A tiny error boundary so a render crash shows the error on-screen instead of a
 * blank white page — essential when testing on real devices (esp. phones over
 * http://, where some Web APIs differ from the laptop). The message is visible
 * so problems are diagnosable without a remote debugger.
 */

import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="m-auto max-w-[480px] w-full p-6 flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold text-danger">Something broke</h2>
          <p className="m-0 text-text-muted text-sm">
            This is shown so the error is visible on-device:
          </p>
          <pre className="whitespace-pre-wrap break-words bg-surface-2 border border-border text-text rounded-lg p-3 text-xs max-h-[40vh] overflow-auto m-0">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="self-start px-5 py-2.5 rounded-pill bg-ink text-ink-contrast font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
