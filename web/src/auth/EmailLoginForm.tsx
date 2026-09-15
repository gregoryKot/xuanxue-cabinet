// Форма «Нет Telegram? Войдите по почте» (ADR-0029) — логика в
// useEmailLoginRequest.ts, этот компонент только рендерит по её состоянию
// (CLAUDE.md «Логика вне компонентов»). Показывается на LoginScreen.tsx
// только при config.emailLoginEnabled — без ключа Resend сервер ответит 503.
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { useEmailLoginRequest } from './useEmailLoginRequest';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };

export function EmailLoginForm() {
  const [email, setEmail] = useState('');
  const { status, error, sentOnce, request } = useEmailLoginRequest();

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await request(email);
  }

  // sentOnce, не status === 'sent': после успеха форма не возвращается,
  // даже если «Отправить ещё раз» временно переводит status в pending/error
  // (CLAUDE.md «Ноль нагрузки на ученика» — не заставляем перепечатывать
  // адрес из-за сбоя повторной отправки).
  if (sentOnce) {
    return (
      <div style={formStyle}>
        <p style={{ margin: 0 }}>
          Письмо отправлено на {email}. Откройте ссылку из него, она работает 15 минут. Не
          пришло — проверьте «Спам».
        </p>
        <FormServerError error={error ? { message: error } : null} />
        <Button
          type="button"
          variant="secondary"
          pending={status === 'pending'}
          onClick={() => void request(email)}
          style={{ width: '100%' }}
        >
          Отправить ещё раз
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
      <Field label="Почта">
        <input
          style={inputStyle}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="имя@почта.ру"
        />
      </Field>
      <FormServerError error={error ? { message: error } : null} />
      <Button
        type="submit"
        variant="secondary"
        pending={status === 'pending'}
        disabled={!email.trim()}
        style={{ width: '100%' }}
      >
        Получить ссылку
      </Button>
    </form>
  );
}
