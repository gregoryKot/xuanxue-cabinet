// Баннер ошибки загрузки списка — текст + кнопка повтора (CLAUDE.md
// «Одна механика — один компонент»): один и тот же блок нужен на каждом
// экране со своим хуком данных (Сводка, Расписание, Планирование, дальше —
// Каналы, Рассылки, Шаблоны), jscpd иначе ловит дубль на втором экране.
import { Button } from './Button';

interface LoadErrorBannerProps {
  message: string;
  onRetry: () => void;
  /** По умолчанию — VOICE-текст новых экранов; «Расписание» (PR J1) уже
   * приучило пользователей к «Обновить» — эту подпись меняем сознательно. */
  retryLabel?: string;
}

export function LoadErrorBanner({
  message,
  onRetry,
  retryLabel = 'Попробовать ещё раз',
}: LoadErrorBannerProps) {
  return (
    <div role="alert" style={{ color: 'var(--danger)' }}>
      <p style={{ margin: '0 0 8px' }}>{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
