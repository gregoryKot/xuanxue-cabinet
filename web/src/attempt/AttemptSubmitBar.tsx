// Подвал формы сдачи (ТЗ п.2): слева тихая строка автосохранения, справа
// «Отправить» — единственная заливка терракотой на экране (правило акцента,
// docs/adr/0031, осталось в силе после ADR-0043). Кнопка по содержимому
// (`primaryActionStyle`), а не во всю колонку: на мониторе полоса в 680
// пикселей читается как «ещё один экран», а не как действие. На телефоне
// строка переносится, и кнопка встаёт под подписью сама.
//
// Свой компонент, а не часть AttemptInProgress.tsx: там живут дедлайн и
// автосохранение, и подтверждение отправки к ним отношения не имеет
// (CLAUDE.md «Файлы»).
//
// Вопросы без ответа (просьба владельца 2026-09-22): когда что-то осталось
// незаполненным, подтверждение спрашивает об этом прямо и зовёт обратно в
// форму — сами вопросы к этому моменту уже подсвечены (QuestionRow.tsx).
// Отправить всё равно можно: ученик вправе пропустить вопрос, наше дело —
// спросить один раз (CLAUDE.md «Ноль нагрузки на ученика»).
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError, type FormError } from '../components/FormServerError';
import { primaryActionStyle } from '../components/screenLayout';
import { formatUnansweredConfirm } from './attemptUnanswered';

const SUBMIT_LABEL = 'Отправить';
const SUBMIT_CONFIRM_TITLE = 'Отправить экзамен?';
const UNANSWERED_CONFIRM_TITLE = 'Отправить без ответов?';
const UNANSWERED_SUBMIT_LABEL = 'Всё равно отправить';
const UNANSWERED_CANCEL_LABEL = 'Вернуться к вопросам';
// Что будет с результатом — уже говорит экран «Отправлено»
// (AttemptSubmitted.tsx); здесь только предупреждение перед необратимым
// действием.
const SUBMIT_CONFIRM_MESSAGE = 'После отправки менять ответы будет нельзя.';

const barStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
};
const saveStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface AttemptSubmitBarProps {
  /** Строка автосохранения (attemptSaveStatusLabel.ts) или `null`, пока
   * сохранять нечего. */
  saveLabel: string | null;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: FormError | null;
  /** Сколько вопросов осталось без ответа прямо сейчас
   * (attemptUnanswered.ts) — ноль означает обычное подтверждение отправки. */
  unansweredCount: number;
  /** Ученик нажал «Отправить» — экран подсвечивает вопросы без ответа, пока
   * открыто подтверждение и после отказа от него (AttemptInProgress.tsx). */
  onCheck: () => void;
}

export function AttemptSubmitBar({
  saveLabel,
  onSubmit,
  submitting,
  submitError,
  unansweredCount,
  onCheck,
}: AttemptSubmitBarProps) {
  const [confirming, setConfirming] = useState(false);
  const hasUnanswered = unansweredCount > 0;

  return (
    <div style={barStyle}>
      <div style={rowStyle}>
        {/* Область живёт в разметке всегда, даже пустая: `aria-live`
            объявляет только то, что меняется внутри уже существующего
            элемента — появись он вместе с текстом, скринридер промолчал бы. */}
        <p aria-live="polite" style={saveStyle}>
          {saveLabel}
        </p>
        <Button
          type="button"
          style={primaryActionStyle}
          onClick={() => {
            onCheck();
            setConfirming(true);
          }}
        >
          {SUBMIT_LABEL}
        </Button>
      </div>
      <FormServerError error={submitError} />

      {confirming && (
        <ConfirmDialog
          title={hasUnanswered ? UNANSWERED_CONFIRM_TITLE : SUBMIT_CONFIRM_TITLE}
          message={
            hasUnanswered
              ? formatUnansweredConfirm(unansweredCount)
              : SUBMIT_CONFIRM_MESSAGE
          }
          confirmLabel={hasUnanswered ? UNANSWERED_SUBMIT_LABEL : SUBMIT_LABEL}
          cancelLabel={hasUnanswered ? UNANSWERED_CANCEL_LABEL : undefined}
          confirmVariant="primary"
          pending={submitting}
          onConfirm={onSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
