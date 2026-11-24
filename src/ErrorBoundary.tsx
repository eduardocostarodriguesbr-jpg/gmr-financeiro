import React from "react";

export class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    onRetry: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="error" role="alert">
          <div>
            <h2>Não foi possível exibir esta tela.</h2>
            <p>
              Tente novamente ou escolha outro menu. Confira o resultado antes
              de repetir uma operação financeira.
            </p>
            <button
              className="button"
              onClick={() => {
                this.setState({ failed: false });
                this.props.onRetry();
              }}
            >
              Tentar novamente
            </button>
          </div>
        </section>
      );
    return this.props.children;
  }
}

// Evaluate page rendering inside the boundary, including inline table mappings.
export function PageContent({ render }: { render: () => React.ReactNode }) {
  return render();
}
