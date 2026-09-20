// Напоминание, пока адрес почты назван, но ссылку из письма ещё не открыли
// (`me.pendingEmail`, ADR-0059, SecondLoginKey.tsx) — до этого момента почта
// не работает как второй ключ входа. «Прислать ссылку ещё раз» зовёт тот же
// useEmailLink с тем же адресом: повтор отправки — действие второго плана,
// поэтому текстовая ссылка, а не кнопка во всю ширину (тот же приём, что
// «Отправить ещё раз» в EmailLoginForm.tsx).
import { FormServerError } from '../components/FormServerError';
import { TextLinkButton } from '../components/TextLinkButton';
import { useEmailLink } from './useEmailLink';

const wrapStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const textStyle = { margin: 0 };

interface PendingEmailNoticeProps {
  email: string;
  refresh: () => Promise<void>;
}

export function PendingEmailNotice({ email, refresh }: PendingEmailNoticeProps) {
  const { status, error, link } = useEmailLink(refresh);

  return (
    <div style={wrapStyle}>
      <p style={textStyle}>
        Мы отправили ссылку на {email}. Откройте её — пока это не сделано, войти по почте
        нельзя.
      </p>
      <FormServerError error={error ? { message: error } : null} />
      <TextLinkButton disabled={status === 'pending'} onClick={() => void link(email)}>
        Прислать ссылку ещё раз
      </TextLinkButton>
    </div>
  );
}
