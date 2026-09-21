// Второй способ входа (ADR-0059) — один блок для `/welcome`
// (welcome/WelcomeScreen.tsx) и «Профиля» (profile/ProfileScreen.tsx,
// ADR-0045): CLAUDE.md «Одна механика — один компонент», второй реализации
// быть не должно (гейт jscpd). У человека сейчас ровно один ключ входа —
// потерял его, потерял кабинет. Смысл предложения — чтобы вход не зависел от
// одного приложения, а не уведомления: на «Профиле» связка Telegram раньше
// была подана как способ их получать, отзыв владельца 2026-09-18 просит эту
// причину заменить на настоящую.
//
// Блок не переведён на showsTelegramOffer целиком: там другой вопрос —
// «Telegram — ключ входа» (признак `telegramLinked`), а showsTelegramOffer
// отвечает на «есть ли чат с ботом» (признак `botChatActive`, ADR-0042).
// Общая у них часть — отметка «у меня нет Telegram» вместе с признаком
// `telegramLinked`: она вынесена в telegram/acceptsTelegramOffer.ts
// (showsTelegramLinkOffer, ADR-0067) и читается через неё же, а не вторым
// условием на месте. Тот же предикат спрашивает видео-вопрос попытки —
// вопрос у них буквально один (attempt/AttemptQuestionVideo.tsx).
import { useCallback, useState } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { screenExplanationStyle } from '../components/screenLayout';
import { showsTelegramLinkOffer } from '../telegram/acceptsTelegramOffer';
import { NoTelegramSwitch } from '../telegram/NoTelegramSwitch';
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
  const { applyMe } = useAuth();
  // Пока true — вместо напоминания «Мы отправили ссылку на …» показана
  // форма с этим же адресом в поле (PendingEmailNotice — «Указать другой
  // адрес»). Сбрасывается не эффектом, а самим applyMeAfterLink после
  // успешной отправки: read-after-write, новый me.pendingEmail уже пришёл в
  // ответе самой записи (ADR-0087) — applyMe синхронный, второго GET нет.
  const [editingEmail, setEditingEmail] = useState(false);
  const applyMeAfterLink = useCallback(
    (next: MeDto) => {
      applyMe(next);
      setEditingEmail(false);
    },
    [applyMe],
  );
  const needsTelegram = showsTelegramLinkOffer(me);
  const needsEmail = !me.hasEmail;
  // enabled: needsEmail — у кого почта уже есть, лишний GET /auth/config не
  // нужен (тот же приём, что у LoginScreen.tsx через JoinScreen, ревью PR #150).
  const { config, status: configStatus } = useAuthConfig(needsEmail);
  const showEmail =
    needsEmail && configStatus === 'ok' && config?.emailLoginEnabled === true;

  // Нечего предложить и нечего объяснять: оба ключа на месте (или отметка
  // погасила Telegram) и почта не нужна — предлагать нечего и незачем
  // рисовать заголовок ради пустоты. `me.noTelegram` — отдельное условие: сама
  // отметка остаётся дорогой назад, даже когда предлагать больше нечего.
  if (!needsTelegram && !showEmail && !me.noTelegram) return null;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {TITLE}
      </h2>
      {/* Ровно один из двух абзацев ниже может быть истинным одновременно
          (аккаунт всегда приходит с одним ключом, см. комментарий у
          констант) — раньше это был один тернарник, теперь два условных
          абзаца: у отметки «нет Telegram» есть третье состояние, когда не
          подходит ни один (needsTelegram и showEmail оба ложны), и тогда не
          рисуется ни один из них. */}
      {needsTelegram && (
        <p style={screenExplanationStyle}>{MISSING_TELEGRAM_EXPLANATION}</p>
      )}
      {!needsTelegram && showEmail && (
        <p style={screenExplanationStyle}>{MISSING_EMAIL_EXPLANATION}</p>
      )}
      {needsTelegram && <TelegramLinkButton onBeforeLink={onBeforeLink} />}
      {showEmail &&
        (me.pendingEmail && !editingEmail ? (
          <PendingEmailNotice
            email={me.pendingEmail}
            applyMe={applyMe}
            onChangeAddress={() => setEditingEmail(true)}
          />
        ) : (
          <EmailLinkForm
            applyMe={applyMeAfterLink}
            initialEmail={me.pendingEmail}
            onCancel={me.pendingEmail ? () => setEditingEmail(false) : undefined}
          />
        ))}
      {/* Условие — просто «Telegram не ключ этого аккаунта». Кому Telegram и
          так открывает вход, отметка не нужна и не показывается; всем
          остальным ссылка стоит рядом с предложением, а когда отметка уже
          стоит — на её месте остаётся дорога назад, чтобы отказ не был
          необратимым. */}
      {!me.telegramLinked && <NoTelegramSwitch noTelegram={me.noTelegram} />}
    </section>
  );
}
