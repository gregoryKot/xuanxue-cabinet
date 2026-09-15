// Границы ошибок рендера (CLAUDE.md, «Обработка ошибок»): логируем через
// console.error — единственное разрешённое место, — и показываем пользователю
// понятный экран вместо белого экрана. Портировано из
// telegram-bot-2/webapp/src/components/ErrorBoundary.tsx, тексты — под
// docs/VOICE.md и единую форму «вы».
//
// Сброс при смене маршрута (аудит L7): без него единственный выход с
// упавшего экрана был перезагрузкой всей вкладки. У класса нет хуков —
// маршрут и переход на главную достаёт функциональная обёртка ниже и
// передаёт классу пропсами: resetKey меняется при переходе, componentDidUpdate
// снимает пойманную ошибку.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
  resetKey: unknown;
  onHome: () => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryBase extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Ошибка рендера:', error, info.componentStack);
  }

  // resetKey — location.pathname обёртки ниже: переход на другой маршрут
  // молча снимает ошибку, экран восстанавливается без перезагрузки (L7).
  override componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={this.handleReload}
            style={{ minHeight: 44, minWidth: 44, padding: '10px 20px' }}
          >
            Обновить
          </button>
          <button
            type="button"
            onClick={this.props.onHome}
            style={{ minHeight: 44, minWidth: 44, padding: '10px 20px' }}
          >
            На главную
          </button>
        </div>
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

/** location.pathname как resetKey и useNavigate для кнопки «На главную» —
 * класс выше хуков не имеет, читает их отсюда через пропсы. */
export function ErrorBoundary({ children }: { children: ReactNode }): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <ErrorBoundaryBase resetKey={location.pathname} onHome={() => void navigate('/')}>
      {children}
    </ErrorBoundaryBase>
  );
}
