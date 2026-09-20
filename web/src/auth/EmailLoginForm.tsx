// Вход по почте (ADR-0029) — второй путь под линией «или по почте» на
// LoginScreen.tsx и JoinScreen.tsx. Логика в useEmailLoginRequest.ts, этот
// компонент только рендерит по её состоянию (CLAUDE.md «Логика вне
// компонентов»). Показывается только при config.emailLoginEnabled — без
// ключа Resend сервер ответит 503.
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { EmailField } from '../components/EmailField';
import { FormServerError } from '../components/FormServerError';
import { TextLinkButton } from '../components/TextLinkButton';
import { useEmailLoginRequest } from './useEmailLoginRequest';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const sentTextStyle = { margin: 0 };

interface EmailLoginFormProps {
  /** Код ссылки-приглашения школы (ADR-0030), когда форма открыта с
   * `/join/:code` — уходит вместе с запросом ссылки на почту. */
  inviteCode?: string;
}

export function EmailLoginForm({ inviteCode }: EmailLoginFormProps) {
  const [email, setEmail] = useState('');
  const { status, error, sentOnce, request } = useEmailLoginRequest(inviteCode);

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
        <p style={sentTextStyle}>
          Письмо ушло на {email}. Откройте ссылку из него, она работает 15 минут. Не
          пришло — проверьте «Спам».
        </p>
        <FormServerError error={error ? { message: error } : null} />
        {/* Текстовая ссылка, а не кнопка: повтор отправки — действие
            второго плана, контурная кнопка во всю ширину звала бы нажать
            её первой (docs/adr/0031). */}
        <TextLinkButton
          disabled={status === 'pending'}
          onClick={() => void request(email)}
        >
          Отправить ещё раз
        </TextLinkButton>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
      {/* size="large" — экран входа крупнее обычных форм кабинета
          (docs/adr/0043, макет 2d): поле почты здесь единственная
          альтернатива Telegram, не одно из многих полей формы. */}
      <EmailField value={email} onChange={setEmail} size="large" />
      <FormServerError error={error ? { message: error } : null} />
      <Button
        type="submit"
        variant="secondary"
        size="large"
        pending={status === 'pending'}
        disabled={!email.trim()}
        style={{ width: '100%' }}
      >
        Прислать ссылку для входа
      </Button>
    </form>
  );
}
