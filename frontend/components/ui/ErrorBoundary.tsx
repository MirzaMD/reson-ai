"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("[ErrorBoundary caught error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-[#0d1117] text-[#e6edf3]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 mb-3">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-sm font-semibold mb-1">
            {this.props.fallbackTitle ?? "Component Render Glitch Recovered"}
          </h3>
          <p className="max-w-md text-xs text-[#8b949e] mb-4 font-mono">
            {this.state.error?.message || "An unexpected rendering event occurred."}
          </p>
          <button
            onClick={this.handleReset}
            className="btn btn-primary text-xs"
          >
            <RotateCcw size={13} />
            <span>Reload View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
