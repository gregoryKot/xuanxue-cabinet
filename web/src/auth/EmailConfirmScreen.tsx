// Публичная страница подтверждения почты (`/email/confirm?token=…`,
// ADR-0059) — открывается по ссылке из письма, отправленного после
// `POST /auth/email/link` (SecondLoginKey.tsx → EmailLinkForm.tsx /
// PendingEmailNotice.tsx). Токен уходит сам, из JS, при открытии страницы
// (useEmailConfirm.ts) — тот же приём защиты от сканеров почтовых клиентов,
// что у входа по почте (ADR-0044, EmailLoginCallbackScreen.tsx): сканер
// открывает ссылку обычным GET и скрипт не выполняет, кнопки «Подтвердить»
// здесь тоже нет.
//
// Экран НЕ требует сессии и НЕ выдаёт её: это подтверждение адреса, а не
// вход (ADR-0059 — токен переносит `pendingEmail` в `email`, но сам не
// открывает сессию). Человек мог открыть письмо не на том устройстве, где
// вошёл в кабинет, поэтому маршрут стоит вне `RequireAuth` (App.tsx), а после
// успеха мы никуда не редиректим сами — только предлагаем открыть кабинет
// кнопкой, и там уже решает RequireAuth, входить или нет.
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EMAIL_CONFIRM_TOKEN_RE } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { SkeletonLines } from '../components/Skeleton';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { useEmailConfirm } from './useEmailConfirm';

const INCOMPLETE_LINK_MESSAGE =
  'Ссылка неполная. Откройте «Профиль» в кабинете и пришлите её ещё раз.';
const SUCCESS_EXPLANATION =
  'Теперь можно входить в кабинет и по почте — не только через Telegram.';
const OPEN_CABINET_LABEL = 'Открыть кабинет';

const errorTextStyle = { margin: 0, color: 'var(--danger)' };
const fullWidthStyle = { width: '100%' };

export default function EmailConfirmScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const hasValidToken = token !== null && EMAIL_CONFIRM_TOKEN_RE.test(token);
  const { status, error } = useEmailConfirm(hasValidToken ? token : null);

  function openCabinet(): void {
    void navigate('/');
  }

  if (!hasValidToken) {
    return (
      <EntryColumn>
        <h1 style={screenTitleStyle}>Ссылка не подошла</h1>
        <p role="alert" style={screenExplanationStyle}>
          {INCOMPLETE_LINK_MESSAGE}
        </p>
        {/* Контур, не заливка терракотой: человек сюда не шёл целенаправленно,
            это тупик с одним выходом, а не главное действие экрана (docs/adr/0031). */}
        <Button variant="secondary" onClick={openCabinet} style={fullWidthStyle}>
          {OPEN_CABINET_LABEL}
        </Button>
      </EntryColumn>
    );
  }

  if (status === 'success') {
    return (
      <EntryColumn>
        <h1 style={screenTitleStyle}>Адрес подтверждён</h1>
        <p style={screenExplanationStyle}>{SUCCESS_EXPLANATION}</p>
        <Button onClick={openCabinet} style={fullWidthStyle}>
          {OPEN_CABINET_LABEL}
        </Button>
      </EntryColumn>
    );
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Подтверждаем адрес</h1>
      {status === 'error' ? (
        <>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
          <Button variant="secondary" onClick={openCabinet} style={fullWidthStyle}>
            {OPEN_CABINET_LABEL}
          </Button>
        </>
      ) : (
        <SkeletonLines widths={['70%', '40%']} />
      )}
    </EntryColumn>
  );
}
