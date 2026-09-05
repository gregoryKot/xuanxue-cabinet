// Границы ошибок рендера (CLAUDE.md, «Обработка ошибок»): логируем через
// console.error — единственное разрешённое место, — и показываем пользователю
// понятный экран вместо белого экрана. Портировано из
// telegram-bot-2/webapp/src/components/ErrorBoundary.tsx, тексты — под
// docs/VOICE.md и единую форму «вы».
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Ошибка рендера:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 480 }}>
        <h1>Что-то сломалось</h1>
        <p>Обновите страницу. Если не помогает — напишите администратору школы.</p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{ minHeight: 44, minWidth: 44, padding: '10px 20px' }}
        >
          Обновить
        </button>
        {import.meta.env.DEV && (
          <details style={{ marginTop: 16 }}>
            <summary>Текст ошибки</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{error.stack ?? error.message}</pre>
          </details>
        )}
      </main>
    );
  }
}
