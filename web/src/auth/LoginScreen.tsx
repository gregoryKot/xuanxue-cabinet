// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Единственный способ входа, на любом устройстве, — переход
// текущей вкладки на Telegram (TelegramLoginSection.tsx, общий с
// JoinScreen.tsx, ADR-0030). Уже вошедшего уводит на /schedule, не показывая
// эту форму. Google — следующий PR.
import { Navigate } from 'react-router-dom';
import { EmailLoginForm } from './EmailLoginForm';
import {
  loginCardStyle,
  loginDividerStyle,
  loginExplanationStyle,
  loginPageStyle,
  loginTitleStyle,
} from './loginScreenStyles';
import { TelegramLoginSection } from './TelegramLoginSection';
import { useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';

export default function LoginScreen() {
  const { status: authStatus } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();

  if (authStatus === 'ok') return <Navigate to="/schedule" replace />;

  return (
    <main style={loginPageStyle}>
      <div style={loginCardStyle}>
        <h1 style={loginTitleStyle}>Кабинет школы Сюань-Сюэ</h1>
        <p style={loginExplanationStyle}>
          Здесь расписание, ссылки на занятия и записи для учителей.
        </p>

        <TelegramLoginSection
          config={config}
          configStatus={configStatus}
          onReload={reload}
        >
          {/* Нет Telegram — email-путь (ADR-0029), выключен по умолчанию, пока
              школа не подключит Resend (SECURITY §2): без этого условия форма
              звала бы 503 на каждый ввод. */}
          {configStatus === 'ok' && config?.emailLoginEnabled && (
            <>
              <hr style={loginDividerStyle} />
              <EmailLoginForm />
            </>
          )}
        </TelegramLoginSection>
      </div>
    </main>
  );
}
