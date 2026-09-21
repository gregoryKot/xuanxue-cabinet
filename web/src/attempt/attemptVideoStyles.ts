// Стили видео-вопроса (AttemptQuestionVideo.tsx) и списка видео-вопросов на
// «Отправлено» (AttemptSubmittedVideos.tsx) — общий облик обоих мест
// (CLAUDE.md «Одна механика — один компонент»). Отдельный модуль, а не
// константы в компоненте: компонент вопроса должен остаться под 150 строк
// (scripts/check-file-size-ratchet.mjs), а стили нужны и списку на «Отправлено».
import type { CSSProperties } from 'react';

export const attemptVideoSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

// Заголовок блока антиквой, но заметно легче названия экзамена
// (screenTitleStyle, 34): внутри экрана это раздел, а не второй экран.
export const attemptVideoHeadingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 22,
  lineHeight: 1.1,
};

export const attemptVideoHintStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export const attemptVideoReceivedListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

// Строка «Заменить»/«Убрать» у своей ссылки (ADR-0086,
// AttemptQuestionVideoReceived.tsx) — тот же приём, что actionsStyle в
// broadcasts/BroadcastCardActions.tsx: небольшой gap без верхнего отступа,
// кнопки читаются продолжением строки времени получения, а не новым блоком.
export const attemptVideoReceivedActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 20,
  flexWrap: 'wrap',
  marginTop: 4,
};

// Визуально — как Button variant="secondary" (components/Button.tsx), но это
// переход по внешней ссылке (t.me), не действие в кабинете: <a>, не
// <button> (тот же приём, что StudentLessonMeeting.tsx: zoomLinkStyle).
// Раньше кнопка держала единственную заливку терракотой экрана (правило
// акцента, docs/adr/0031); ADR-0084 сделал основным путём ссылку — заливка
// переехала на «Сохранить ссылку» (AttemptMediaLinkForm.tsx), а бот остался
// вторым путём с силуэтом контура, не заливки.
export const attemptVideoTelegramLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 'var(--radius-control)',
  fontWeight: 600,
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--control-border)',
  textDecoration: 'none',
  alignSelf: 'flex-start',
};
