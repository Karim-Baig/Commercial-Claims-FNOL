import * as React from "react";

/**
 * React error boundary containment (DR-3.4, NFR-37).
 *
 * A failure inside the Claims Micro-Frontend degrades gracefully and must not
 * destabilise the Meridian shell. Shell navigation stays usable.
 */
interface Props {
  children: React.ReactNode;
  fallback: (reset: () => void, error: Error) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class MfeErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production this goes to Datadog (NFR-51).
    console.error("[shell] Claims MFE crashed - contained by error boundary", error, info);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(() => this.setState({ error: null }), this.state.error);
    }
    return this.props.children;
  }
}
