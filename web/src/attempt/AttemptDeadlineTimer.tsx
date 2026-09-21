// Живой отсчёт до дедлайна попытки (отзыв владельца 2026-09-21: заметное
// предупреждение под конец времени и настоящий таймер, а не тусклая строка
// раз в 30 секунд). Пересчёт раз в секунду — `useNow(1000)` — живёт ЗДЕСЬ, а
// не в AttemptInProgress.tsx: там форма из полусотни вопросов, и перерисовывать
// её каждую секунду целиком нельзя — перерисовывается только этот маленький
// компонент.
//
// Дедлайн по-прежнему решает сервер (ТЗ 4.4 п.7, блокер аудита 2026-09-15
// «Дедлайн решает сервер»): локальный отсчёт добежал до нуля — не приговор,
// а повод спросить сервер (`onExpired`, тот же приём с guard через `useRef`,
// что раньше жил прямо в AttemptInProgress.tsx как `reloadedForExpiry`).
// Терминальный статус по-прежнему приходит только с сервера — переключает
// AttemptScreen.tsx по `attempt.status`, этот компонент его не рисует.
import { useEffect, useRef, type CSSProperties } from 'react';
import { getAttemptTimeStatus } from './attemptDeadline';
import { useNow } from './useNow';

const NOW_REFRESH_MS = 1000;

interface AttemptDeadlineTimerProps {
  /** Обязателен: форма без лимита времени этот компонент не монтирует вовсе
   * (AttemptInProgress.tsx), иначе `useNow` ниже будил бы React раз в секунду
   * там, где считать нечего — экзамен идёт с телефона. */
  deadlineAt: string;
  /** Местный отсчёт добежал до нуля — повод спросить сервер, не приговор. */
  onExpired: () => void;
}

// Спокойное состояние — тихая строка без заливки, как было раньше
// (screenHintStyle без отрицательного отступа: здесь строка не под
// объяснением экрана, а сама по себе).
const calmStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

// Тревожный тон — заметно, но не нарушает «один акцент на экран» (ADR-0043):
// акцент — заливка терракотой у кнопки «Отправить» в подвале формы, здесь её
// нет. Контраст var(--danger) на var(--panel-warm) — 6.59:1 (посчитано по
// формуле WCAG, тот же приём, что в StudentExamCard.tsx), с запасом выше
// AA 4.5 для этого кегля.
const warningStyle: CSSProperties = {
  margin: 0,
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--panel-warm)',
  color: 'var(--danger)',
  fontWeight: 600,
  fontSize: 16,
};

// `sticky` — строка не должна уезжать вверх экрана, пока ученик листает
// полсотни вопросов (отзыв владельца). `contentColumnStyle` (appShellStyles.ts)
// — единственное, что прокручивается в оболочке, окно не участвует в скролле
// вовсе; компонент вставлен в AttemptInProgress.tsx прямым потомком секции
// (не внутрь маленькой шапки с рубрикой и названием) — иначе `sticky`
// ограничен высотой родителя и «прилипает» на пару пикселей вместо всей формы.
// Фон страницы под собой — иначе текст вопроса, проскроленный под таймером,
// читался бы сквозь него; `zIndex` — над карточкой вопросов, а не под ней.
const wrapperStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--paper)',
  padding: '4px 0',
};

export function AttemptDeadlineTimer({
  deadlineAt,
  onExpired,
}: AttemptDeadlineTimerProps) {
  const now = useNow(NOW_REFRESH_MS);
  const status = getAttemptTimeStatus(deadlineAt, now);
  const reloadedForExpiry = useRef(false);

  useEffect(() => {
    if (!status.expired || reloadedForExpiry.current) return;
    reloadedForExpiry.current = true;
    onExpired();
  }, [status.expired, onExpired]);

  return (
    <div style={wrapperStyle}>
      {status.label && (
        <p style={status.warning ? warningStyle : calmStyle}>{status.label}</p>
      )}
      {/* Скринридеру — редкая фраза на порогах, не тикающий отсчёт: без
          aria-live на самой строке выше, иначе он читал бы каждую секунду. */}
      <p className="xuanxue-sr-only" role="status">
        {status.announcement}
      </p>
    </div>
  );
}
