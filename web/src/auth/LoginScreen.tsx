// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Облик — колонка на бумаге (components/EntryColumn.tsx), без
// карточки: вход должен выглядеть страницей сайта школы, а не окном чужого
// приложения (docs/adr/0031). Основной способ входа, на любом устройстве, —
// переход текущей вкладки на Telegram (TelegramLoginSection.tsx, общий с
// JoinScreen.tsx, ADR-0030). Уже вошедшего уводит на сохранённый адрес или
// домашний экран, не показывая эту форму (аудит L2 — раньше жёстко на
// /schedule, мимо экрана, с которого человек пришёл).
import { Navigate } from 'react-router-dom';
import { EntryColumn } from '../components/EntryColumn';
import { LabeledDivider } from '../components/LabeledDivider';
import { screenExplanationStyle } from '../components/screenLayout';
import { EmailLoginForm } from './EmailLoginForm';
import { TelegramLoginSection } from './TelegramLoginSection';
import { hasSession, useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { postLoginPath } from './returnTo';

// Единственное место, где кабинет вообще упоминает ссылку-приглашение
// (ADR-0030) до входа: и Telegram, и почта всё равно упрутся в неё дальше
// (403 без нового человека в школе). Отзыв владельца (ADR-0044): раньше
// строка пряталась мелкой припиской под формой почты — незнакомец уходил в
// Telegram и получал красным 403, ничего не зная про ссылку заранее.
// CLAUDE.md требует объяснять «откуда это и зачем» ДО первого действия, а не
// после отказа, поэтому приписка стоит над кнопкой входа и видна всегда.
const INVITE_REQUIRED_MESSAGE =
  'Первый раз здесь? Кабинет открывается по ссылке-приглашению от учителя — без неё войти не получится.';

export default function LoginScreen() {
  const { status: authStatus } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();

  // hasSession, не authStatus === 'ok' (ревью PR #150): заблокированного тоже
  // уводит с формы входа — здесь ему нечего делать, а RequireAuth дальше
  // покажет ACCESS_MESSAGE вместо того, чтобы он тут снова жал «Войти».
  if (hasSession(authStatus)) return <Navigate to={postLoginPath()} replace />;

  return (
    <EntryColumn>
      {/* xuanxue-login-title, не screenTitleStyle: заголовок входа крупнее и
          отзывчивый (34px на телефоне / 40px на мониторе, index.css) — это
          первый экран кабинета, не раздел внутри него (макет 2d). */}
      <h1 className="xuanxue-login-title">Кабинет школы</h1>
      <p style={screenExplanationStyle}>
        Расписание, ссылки на занятия, записи и экзамены. Для учеников и учителей.
      </p>
      <p style={screenExplanationStyle}>{INVITE_REQUIRED_MESSAGE}</p>

      <TelegramLoginSection config={config} configStatus={configStatus} onReload={reload}>
        {/* Нет Telegram — email-путь (ADR-0029), выключен по умолчанию, пока
            школа не подключит Resend (SECURITY §2): без этого условия форма
            звала бы 503 на каждый ввод. */}
        {configStatus === 'ok' && config?.emailLoginEnabled && (
          <>
            <LabeledDivider label="или по почте" />
            <EmailLoginForm />
          </>
        )}
      </TelegramLoginSection>
    </EntryColumn>
  );
}
