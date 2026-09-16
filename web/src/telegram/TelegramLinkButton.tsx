// Кнопка «Связать Telegram» (ADR-0034) — один переиспользуемый блок для двух
// мест: экрана сдачи (AttemptMediaPrompt.tsx — без связки бот не поймёт,
// чьё видео пришло, ADR-0023) и «Уведомлений» (NotificationsScreen.tsx —
// без связки уведомлениям в Telegram некуда приходить). У каждого места своя
// причина — она приходит пропсом `explanation`, разметка и логика общие
// (CLAUDE.md «Одна механика — один компонент»). Текст ошибки — тот же
// приём, что LogoutButton.tsx.
//
// Read-after-write: кабинет не может дождаться возврата из Telegram
// программно (перехода на чужой домен не видно), только заметить, что
// вкладка снова видима, — и попросить AuthProvider перечитать /auth/me
// (тот же приём, что PendingApprovalScreen.tsx). Флаг «связку начинали»
// держим в ref, а не в состоянии: само событие видимости не должно
// перерисовывать кнопку.
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { useTelegramLinkCode } from './useTelegramLinkCode';

const BUTTON_LABEL = 'Связать Telegram';

interface TelegramLinkButtonProps {
  /** Зачем связка нужна именно на этом экране (CLAUDE.md «каждая фича
   * объясняет откуда это и зачем до первого действия»). */
  explanation?: string;
}

export function TelegramLinkButton({ explanation }: TelegramLinkButtonProps) {
  const { refresh } = useAuth();
  const { pending, error, link } = useTelegramLinkCode();
  const linkStartedRef = useRef(false);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState !== 'visible' || !linkStartedRef.current) return;
      linkStartedRef.current = false;
      void refresh();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  async function handleClick(): Promise<void> {
    // Флаг ставим по итогу запроса: сбой (бот не подключён, сеть) не должен
    // выглядеть как «начатая связка» — возврат на вкладку не должен зря
    // перечитывать сессию.
    linkStartedRef.current = await link();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {explanation && <p style={{ margin: 0 }}>{explanation}</p>}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <Button
        pending={pending}
        onClick={() => void handleClick()}
        style={{ alignSelf: 'flex-start' }}
      >
        {BUTTON_LABEL}
      </Button>
    </div>
  );
}
