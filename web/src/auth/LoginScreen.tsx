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
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { EmailLoginForm } from './EmailLoginForm';
import { TelegramLoginSection } from './TelegramLoginSection';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { postLoginPath } from './returnTo';

export default function LoginScreen() {
  const { status: authStatus } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();

  if (authStatus === 'ok') return <Navigate to={postLoginPath()} replace />;

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Кабинет школы</h1>
      <p style={screenExplanationStyle}>
        Расписание, ссылки на занятия, записи и экзамены. Для учеников и учителей.
      </p>

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
