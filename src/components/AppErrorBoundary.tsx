import { Component, type ErrorInfo, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('La aplicación se recuperó de un error.', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="center-screen error-screen">
          <p className="eyebrow">NO SE PUDO CONTINUAR</p>
          <h1>Recarguemos el juego</h1>
          <p>No se perdió ninguna información importante.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
