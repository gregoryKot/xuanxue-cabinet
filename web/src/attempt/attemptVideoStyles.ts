// Стили видео-вопроса (AttemptQuestionVideo.tsx) и списка видео-вопросов на
// «Отправлено» (AttemptSubmittedVideos.tsx). Облик самого раздела
// («Видео») — attemptSectionStyle/attemptSectionHeadingStyle в
// attemptLayout.ts: он общий ещё и с разделом «Ваши ответы»
// (AttemptSubmittedAnswers.tsx), поэтому и переехал туда. Здесь остаются
// только стили внутри блока — компонент вопроса должен остаться под 150
// строк (scripts/check-file-size-ratchet.mjs).
import type { CSSProperties } from 'react';

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
