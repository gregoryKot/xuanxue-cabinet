// Вход по почте (ADR-0029) — второй путь под линией «или по почте» на
// LoginScreen.tsx и JoinScreen.tsx. Логика в useEmailLoginRequest.ts, этот
// компонент только рендерит по её состоянию (CLAUDE.md «Логика вне
// компонентов»). Показывается только при config.emailLoginEnabled — без
// ключа Resend сервер ответит 503.
//
// Три состояния, не два (ADR-0104): «покой» (форма отправки), «письмо
// ушло» (sentOnce) и «код из покоя» (manualCode) — дверь для ввода кода из
// письма без предварительной отправки в этой же вкладке. Она нужна ровно
// для случая, ради которого всё это делается: человек ушёл в почту,
// приложение на домашнем экране айфона перезапустилось, а «письмо ушло» в
// памяти вкладки не пережило перезапуск — без этой двери код в такой
// ситуации ввести было бы негде.
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { EmailField } from '../components/EmailField';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { EmailCodeForm } from './EmailCodeForm';
import { useEmailLoginRequest } from './useEmailLoginRequest';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const sentTextStyle = { margin: 0 };

// Экран говорит про код и молчит про устройство входа (отзыв владельца
// 2026-09-22: «объяснения непонятные вообще»). Прежние версии сначала
// обещали одну ссылку, потом объясняли, что «ссылка войдёт в браузере, а не
// здесь» — то есть пересказывали ученику, как у нас устроены cookie. Ему
// выбирать не из чего: код работает и в браузере, и в приложении с иконки,
// поэтому история одна — попросили код, ввели код, вошли. Про ссылку
// рассказывает письмо (api/src/mail/mail.service.ts), где выбор и правда
// есть.

/** Подсказка для случая, когда человек пришёл вводить код, не отправив
 * письмо в этой же вкладке: адрес у формы пустой, и без строки непонятно,
 * чего от него хотят. После отправки письма она не нужна — там всё сказано
 * абзацем выше. */
const MANUAL_CODE_MESSAGE = 'Введите адрес почты и код из письма.';

interface EmailLoginFormProps {
  /** Код ссылки-приглашения школы (ADR-0030), когда форма открыта с
   * `/join/:code` — уходит вместе с запросом ссылки на почту и с кодом. */
  inviteCode?: string;
}

export function EmailLoginForm({ inviteCode }: EmailLoginFormProps) {
  const [email, setEmail] = useState('');
  const { status, error, sentOnce, request } = useEmailLoginRequest(inviteCode);
  // Дверь в код из состояния покоя (ADR-0104, см. комментарий выше файла).
  const [manualCode, setManualCode] = useState(false);

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
          <RichText
            text={`Письмо ушло на ${email}. Введите код из него — он работает **15 минут**. Не пришло — проверьте «Спам».`}
          />
        </p>
        <FormServerError error={error ? { message: error } : null} />
        <EmailCodeForm email={email} inviteCode={inviteCode} />
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

  if (manualCode) {
    return (
      <div style={formStyle}>
        <p style={screenExplanationStyle}>{MANUAL_CODE_MESSAGE}</p>
        <EmailCodeForm email={email} onEmailChange={setEmail} inviteCode={inviteCode} />
        <TextLinkButton onClick={() => setManualCode(false)}>Назад</TextLinkButton>
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
        Прислать код
      </Button>
      {/* Дверь в ввод кода без повторной отправки письма (ADR-0104, см.
          комментарий выше файла) — на случай, если «письмо ушло» в памяти
          вкладки не пережило перезапуск приложения. */}
      <TextLinkButton onClick={() => setManualCode(true)}>
        У меня уже есть код
      </TextLinkButton>
    </form>
  );
}
