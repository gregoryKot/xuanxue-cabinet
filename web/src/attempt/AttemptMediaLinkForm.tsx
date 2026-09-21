// Форма «вставить ссылку на видео» — запасной путь ADR-0023 для тех, у кого
// нет Telegram. Сеть и read-after-write — в useAttempt.ts (addMediaLink),
// этот компонент только поле и кнопка, тот же приём, что GradingForm.tsx:
// pending/error приходят пропсами от экрана, а не своим хуком с fetch.
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError, type FormError } from '../components/FormServerError';
import { primaryActionStyle } from '../components/screenLayout';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };

interface AttemptMediaLinkFormProps {
  onSubmit: (url: string) => Promise<boolean>;
  pending: boolean;
  error: FormError | null;
}

export function AttemptMediaLinkForm({
  onSubmit,
  pending,
  error,
}: AttemptMediaLinkFormProps) {
  const [url, setUrl] = useState('');

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    // Очищаем поле только на успех — на сбое ссылка должна остаться, чтобы
    // не перепечатывать её после опечатки или сетевого сбоя.
    if (await onSubmit(url)) setUrl('');
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
      <Field label="Ссылка на видео">
        <input
          style={inputStyle}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
        />
      </Field>
      <FormServerError error={error} />
      {/* Контур, не заливка: терракота на этом экране уже занята кнопкой
          «Отправить видео боту в Telegram» — она и есть главный путь
          (ADR-0023), а ссылка руками остаётся запасным (правило акцента,
          docs/adr/0031, осталось в силе после ADR-0043). */}
      <Button
        type="submit"
        variant="secondary"
        style={primaryActionStyle}
        pending={pending}
        disabled={!url.trim()}
      >
        Сохранить ссылку
      </Button>
    </form>
  );
}
