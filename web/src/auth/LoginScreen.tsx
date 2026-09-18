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
import { noteStyle, screenExplanationStyle } from '../components/screenLayout';
import { EmailLoginForm } from './EmailLoginForm';
import { TelegramLoginSection } from './TelegramLoginSection';
import { hasSession, useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { postLoginPath } from './returnTo';

// Единственное место, где кабинет вообще упоминает ссылку-приглашение
// (ADR-0030) до входа: и Telegram, и почта всё равно упрутся в неё дальше
// (403 без нового человека в школе), а до попытки входа это неочевидно.
const NO_INVITE_FOOTER_MESSAGE =
  'Кабинет открывается по ссылке-приглашению школы. Нет ссылки — напишите учителю.';

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

      <TelegramLoginSection config={config} configStatus={configStatus} onReload={reload}>
        {/* Фрагмент, не два соседних условия: приписка о ссылке-приглашении
            нужна независимо от emailLoginEnabled, но должна прятаться вместе
            с формой почты на время авто-входа по фрагменту адреса
            (TelegramLoginSection.tsx — «форма почты не должна мигать раньше
            скелетона», то же верно и для этой приписки). */}
        <>
          {/* Нет Telegram — email-путь (ADR-0029), выключен по умолчанию, пока
              школа не подключит Resend (SECURITY §2): без этого условия форма
              звала бы 503 на каждый ввод. */}
          {configStatus === 'ok' && config?.emailLoginEnabled && (
            <>
              <LabeledDivider label="или по почте" />
              <EmailLoginForm />
            </>
          )}
          <p style={noteStyle}>{NO_INVITE_FOOTER_MESSAGE}</p>
        </>
      </TelegramLoginSection>
    </EntryColumn>
  );
}
