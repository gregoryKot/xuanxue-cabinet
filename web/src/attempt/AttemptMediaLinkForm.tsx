// Форма «вставить ссылку на видео» — основной путь ответа на видео-вопрос
// (ADR-0084, уточняет ADR-0023): доступен всем, не только тем, у кого
// привязан Telegram. Сеть и read-after-write — в useAttempt.ts (addMediaLink),
// этот компонент только поле, тот же приём, что GradingForm.tsx: pending/error
// приходят пропсами от экрана, а не своим хуком с fetch.
//
// Кнопки «Сохранить ссылку» больше нет (ADR-0136, уточняет ADR-0084): отзыв
// тестера 2026-09-27 — ссылка вставлена, кнопка не нажата, вопрос остался
// без ответа. Ссылка сохраняет себя сама: на вставке готового URL, на
// уходе с поля и на Enter (неявная отправка формы с одним текстовым полем).
import {
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
} from 'react';
import { Field, inputStyle } from '../components/Field';
import { FormServerError, type FormError } from '../components/FormServerError';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const statusStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const SAVING_STATUS = 'Сохраняем ссылку…';
const URL_PATTERN = /^https?:\/\//;

interface AttemptMediaLinkFormProps {
  onSubmit: (url: string) => Promise<boolean>;
  pending: boolean;
  error: FormError | null;
  /** Показ без права ответить — предпросмотр «глазами ученика»
   * (AttemptQuestionVideo.tsx): поле выключено, сохранять нечего. */
  disabled?: boolean;
}

export function AttemptMediaLinkForm({
  onSubmit,
  pending,
  error,
  disabled,
}: AttemptMediaLinkFormProps) {
  const [url, setUrl] = useState('');
  // Синхронный латч поверх `pending`-пропа: тот приходит из состояния
  // родителя и обновляется только на следующем рендере, а вставка ссылки
  // сохраняет её сразу же — без латча уход с поля тем же тактом успел бы
  // отправить вторую копию той же ссылки, пока первая ещё не долетела.
  const savingRef = useRef(false);

  async function save(value: string): Promise<void> {
    if (pending || savingRef.current) return;
    savingRef.current = true;
    try {
      // Очищаем поле только на успех — на сбое ссылка должна остаться, чтобы
      // не перепечатывать её после опечатки или сетевого сбоя.
      if (await onSubmit(value)) setUrl('');
    } finally {
      savingRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed) void save(trimmed);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData('text').trim();
    if (!URL_PATTERN.test(pasted)) return;
    // Вставка ссылки заменяет содержимое поля целиком и сохраняется тут же —
    // отдельно нажимать уже нечего.
    event.preventDefault();
    setUrl(pasted);
    void save(pasted);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>): void {
    const trimmed = event.target.value.trim();
    if (trimmed) void save(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <Field label="Ссылка на видео">
        <input
          style={inputStyle}
          disabled={disabled}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder="https://…"
          inputMode="url"
        />
      </Field>
      {pending && (
        <p role="status" style={statusStyle}>
          {SAVING_STATUS}
        </p>
      )}
      <FormServerError error={error} />
    </form>
  );
}
