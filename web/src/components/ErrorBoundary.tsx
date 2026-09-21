// Границы ошибок рендера (CLAUDE.md, «Обработка ошибок»): логируем через
// console.error и параллельно шлём отчёт на сервер (ADR-0071,
// errors/reportClientError.ts) — раньше упавший рендер не оставлял следа
// нигде, кроме консоли того, у кого сломался экран. Показываем
// пользователю понятный экран вместо белого экрана. Портировано из
// telegram-bot-2/webapp/src/components/ErrorBoundary.tsx, тексты — под
// docs/VOICE.md и единую форму «вы».
//
// Сброс при смене маршрута (аудит L7): без него единственный выход с
// упавшего экрана был перезагрузкой всей вкладки. У класса нет хуков —
// маршрут и переход на главную достаёт функциональная обёртка ниже и
// передаёт классу пропсами: resetKey меняется при переходе, componentDidUpdate
// снимает пойманную ошибку.
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reportClientError } from '../errors/reportClientError';
import { Button } from './Button';
import { editorActionsRowStyle } from './editorLayout';
import { screenExplanationStyle, screenTitleStyle } from './screenLayout';

// Экран ошибки — той же колонкой, шрифтом и кнопками, что остальной кабинет
// (ADR-0043): прежний вариант с system-ui и голыми <button> у левого края
// выглядел чужим (снимок владельца 2026-09-21). По центру и с воздухом
// сверху: на мониторе колонка иначе прижималась к углу.
const pageStyle: CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: '48px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

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
    // Без этого упавший рендер не доходил до сервера вовсе (ADR-0071) —
    // ни строки в логах Railway, ни сообщения в Telegram.
    void reportClientError('render', error);
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
      <main style={pageStyle}>
        <h1 style={screenTitleStyle}>Что-то сломалось</h1>
        <p style={screenExplanationStyle}>
          Обновите страницу. Если не помогает — напишите администратору школы.
        </p>
        <div style={editorActionsRowStyle}>
          <Button type="button" onClick={this.handleReload}>
            Обновить
          </Button>
          <Button type="button" variant="secondary" onClick={this.props.onHome}>
            На главную
          </Button>
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
