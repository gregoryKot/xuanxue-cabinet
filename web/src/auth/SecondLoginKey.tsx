// Второй способ входа (ADR-0059) — один блок для `/welcome`
// (welcome/WelcomeScreen.tsx) и «Профиля» (profile/ProfileScreen.tsx,
// ADR-0045): CLAUDE.md «Одна механика — один компонент», второй реализации
// быть не должно (гейт jscpd). У человека сейчас ровно один ключ входа —
// потерял его, потерял кабинет. Смысл предложения — чтобы вход не зависел от
// одного приложения, а не уведомления: на «Профиле» связка Telegram раньше
// была подана как способ их получать, отзыв владельца 2026-09-18 просит эту
// причину заменить на настоящую.
import type { MeDto } from '@xuanxue/shared';
import { screenExplanationStyle } from '../components/screenLayout';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { EmailLinkForm } from './EmailLinkForm';
import { PendingEmailNotice } from './PendingEmailNotice';

const TITLE = 'Второй способ входа';

// Ровно один из двух текстов ниже показывается за раз: аккаунт всегда
// приходит уже с одним ключом (тем, через который вошли впервые), блок
// предлагает завести второй. Оба потерянными сразу быть не могут.
const MISSING_TELEGRAM_EXPLANATION =
  'Сейчас в кабинет пускает только почта. Свяжите Telegram — если потеряете доступ к ящику, войдёте через него.';
const MISSING_EMAIL_EXPLANATION =
  'Сейчас в кабинет пускает только Telegram. Добавьте почту — если потеряете к нему доступ, войдёте по ссылке из письма.';

const sectionStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const headingStyle = { margin: 0 };

interface SecondLoginKeyProps {
  me: MeDto;
  /** Дождаться перед уходом в Telegram (`TelegramLinkButton.tsx`) — на
   * `/welcome` человек мог начать вводить имя, WelcomeScreen.tsx передаёт
   * сюда сохранение черновика. «Профиль» проп не передаёт: там уходить
   * некуда, сохранять нечего. */
  onBeforeLink?: () => Promise<void>;
}

export function SecondLoginKey({ me, onBeforeLink }: SecondLoginKeyProps) {
  const { refresh } = useAuth();
  const needsTelegram = !me.telegramLinked;
  const needsEmail = !me.hasEmail;
  // enabled: needsEmail — у кого почта уже есть, лишний GET /auth/config не
  // нужен (тот же приём, что у LoginScreen.tsx через JoinScreen, ревью PR #150).
  const { config, status: configStatus } = useAuthConfig(needsEmail);
  const showEmail =
    needsEmail && configStatus === 'ok' && config?.emailLoginEnabled === true;

  // Нечего предложить: оба ключа на месте, либо почта не подключена школой
  // (нет ключа Resend) и Telegram и так связан — предлагать нечего и незачем
  // рисовать заголовок ради пустоты.
  if (!needsTelegram && !showEmail) return null;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {TITLE}
      </h2>
      <p style={screenExplanationStyle}>
        {needsTelegram ? MISSING_TELEGRAM_EXPLANATION : MISSING_EMAIL_EXPLANATION}
      </p>
      {needsTelegram && <TelegramLinkButton onBeforeLink={onBeforeLink} />}
      {showEmail &&
        (me.pendingEmail ? (
          <PendingEmailNotice email={me.pendingEmail} refresh={refresh} />
        ) : (
          <EmailLinkForm refresh={refresh} />
        ))}
    </section>
  );
}
