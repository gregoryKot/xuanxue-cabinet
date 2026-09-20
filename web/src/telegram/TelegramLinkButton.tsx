// Кнопка «Связать Telegram» (ADR-0034) — один переиспользуемый блок для двух
// мест: экрана сдачи (AttemptQuestionVideo.tsx — без связки бот не поймёт,
// чьё видео пришло, ADR-0023) и «Профиля» (profile/ProfileScreen.tsx —
// без связки уведомлениям в Telegram некуда приходить). У каждого места своя
// причина — она приходит пропсом `explanation`, разметка и логика общие
// (CLAUDE.md «Одна механика — один компонент»). Текст ошибки — тот же
// приём, что LogoutButton.tsx.
//
// Read-after-write: кабинет не может дождаться возврата из Telegram
// программно (перехода на чужой домен не видно), только заметить, что
// вкладка снова видима, — и попросить AuthProvider перечитать /auth/me
// (приём, унаследованный от удалённого экрана ожидания, ADR-0036). Флаг «связку начинали»
// держим в ref, а не в состоянии: само событие видимости не должно
// перерисовывать кнопку.
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Button, type ButtonVariant } from '../components/Button';
import { useTelegramLinkCode } from './useTelegramLinkCode';

const BUTTON_LABEL = 'Связать Telegram';

interface TelegramLinkButtonProps {
  /** Зачем связка нужна именно на этом экране (CLAUDE.md «каждая фича
   * объясняет откуда это и зачем до первого действия»). */
  explanation?: string;
  /** Дождаться перед `link()`, то есть до ухода вкладки в Telegram (ADR-0059,
   * welcome/WelcomeScreen.tsx): человек на `/welcome` мог уже набрать имя, а
   * переход в Telegram уносит вкладку — набранное пропало бы. `/welcome`
   * передаёт сюда сохранение черновика, и заодно человек возвращается из
   * Telegram уже внутрь кабинета (имя успело сохраниться, needsProfile снят
   * ещё до перехода). profile/ProfileScreen.tsx и
   * attempt/AttemptQuestionVideo.tsx проп не передают — там уходить некуда,
   * их поведение не меняется. */
  onBeforeLink?: () => Promise<void>;
  /** По умолчанию — первичная заливка (экран сдачи, «Профиль»). На
   * «Уведомлениях» терракота уже занята точками непрочитанного, поэтому
   * предложение связать бота там идёт вторичным силуэтом — правило «один
   * акцент на экран» (ADR-0043), тот же приём, что у кнопки в
   * student/StudentExamCard.tsx. */
  variant?: ButtonVariant;
}

export function TelegramLinkButton({
  explanation,
  onBeforeLink,
  variant,
}: TelegramLinkButtonProps) {
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
    if (onBeforeLink) await onBeforeLink();
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
        variant={variant}
        pending={pending}
        onClick={() => void handleClick()}
        style={{ alignSelf: 'flex-start' }}
      >
        {BUTTON_LABEL}
      </Button>
    </div>
  );
}
