// Форма второго ключа входа — почты (ADR-0059, SecondLoginKey.tsx): вызывает
// POST /auth/email/link через useEmailLink.ts, этот компонент только
// рендерит по её состоянию (CLAUDE.md «Логика вне компонентов»). Вариант
// кнопки — secondary: главное действие экрана (`/welcome` — «Продолжить»,
// «Профиль» — «Сохранить имя») уже держит терракоту, вторая заливка на том же
// экране была бы вторым акцентом (docs/adr/0031, правило акцента).
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { EmailField } from '../components/EmailField';
import { FormServerError } from '../components/FormServerError';
import { TextLinkButton } from '../components/TextLinkButton';
import { useEmailLink } from './useEmailLink';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };

interface EmailLinkFormProps {
  refresh: () => Promise<void>;
  /** Опечатанный адрес при смене (SecondLoginKey.tsx, PendingEmailNotice —
   * «Указать другой адрес»): поправить, а не набирать заново. */
  initialEmail?: string;
  /** Есть только при смене уже названного адреса — рендерит «Оставить
   * прежний адрес» под кнопкой отправки. */
  onCancel?: () => void;
}

export function EmailLinkForm({ refresh, initialEmail, onCancel }: EmailLinkFormProps) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const { status, error, link } = useEmailLink(refresh);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await link(email);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
      <EmailField value={email} onChange={setEmail} />
      <FormServerError error={error ? { message: error } : null} />
      <Button
        type="submit"
        variant="secondary"
        pending={status === 'pending'}
        disabled={!email.trim()}
        style={{ alignSelf: 'flex-start' }}
      >
        Привязать почту
      </Button>
      {onCancel && (
        <TextLinkButton onClick={onCancel}>Оставить прежний адрес</TextLinkButton>
      )}
    </form>
  );
}
