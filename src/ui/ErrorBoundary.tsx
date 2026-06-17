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
        <div style={{ padding: 24, margin: "auto", maxWidth: 480, color: "#1a1a1a" }}>
          <h2 style={{ color: "#D55E00" }}>Something broke</h2>
          <p style={{ color: "#666" }}>This is shown so the error is visible on-device:</p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#F5F5F5",
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: "#111", color: "#fff" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
