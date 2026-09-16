// Подвал формы сдачи (ТЗ п.2): слева тихая строка автосохранения, справа
// «Отправить» — единственная киноварь на экране (правило акцента,
// docs/adr/0031). Кнопка по содержимому (`primaryActionStyle`), а не во всю
// колонку: на мониторе полоса в 680 пикселей читается как «ещё один экран»,
// а не как действие. На телефоне строка переносится, и кнопка встаёт под
// подписью сама.
//
// Свой компонент, а не часть AttemptInProgress.tsx: там живут дедлайн и
// автосохранение, и подтверждение отправки к ним отношения не имеет
// (CLAUDE.md «Файлы»).
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError, type FormError } from '../components/FormServerError';
import { primaryActionStyle } from '../components/screenLayout';

const SUBMIT_LABEL = 'Отправить';
const SUBMIT_CONFIRM_TITLE = 'Отправить экзамен?';
const SUBMIT_CONFIRM_MESSAGE =
  'После отправки менять ответы будет нельзя. Учитель проверит и пришлёт результат.';

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
}

export function AttemptSubmitBar({
  saveLabel,
  onSubmit,
  submitting,
  submitError,
}: AttemptSubmitBarProps) {
  const [confirming, setConfirming] = useState(false);

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
          onClick={() => setConfirming(true)}
        >
          {SUBMIT_LABEL}
        </Button>
      </div>
      <FormServerError error={submitError} />

      {confirming && (
        <ConfirmDialog
          title={SUBMIT_CONFIRM_TITLE}
          message={SUBMIT_CONFIRM_MESSAGE}
          confirmLabel={SUBMIT_LABEL}
          confirmVariant="primary"
          pending={submitting}
          onConfirm={onSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
