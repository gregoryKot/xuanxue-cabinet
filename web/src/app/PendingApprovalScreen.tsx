// Экран ожидания — первый вход через Telegram даёт status: 'invited'
// (ADR-0026): человек ещё не видит расписание и экзамены, AppShell.tsx
// показывает этот экран вместо Outlet/StudentScreen и прячет навигацию —
// подтверждённых разделов у invited-человека пока нет. «Выйти» — по-прежнему
// в общем подвале AppShell, здесь своей кнопки нет.
import { useAuthConfig } from '../auth/useAuthConfig';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { PENDING_APPROVAL_MESSAGE } from '@xuanxue/shared';

// Заголовок и текст ожидания — не «нет доступа»: человек уже вошёл, дальше
// ждать, а не разбираться с ошибкой (docs/VOICE.md, обязательно «конкретика
// вместо обобщений»). Текст ожидания — тот же PENDING_APPROVAL_MESSAGE, что
// отдаёт API на любой закрытый для invited маршрут (shared/src/auth.ts):
// один источник вместо двух формулировок одного и того же события.
const TITLE = 'Ждём подтверждения';
const LONG_WAIT_HINT =
  'Долго нет ответа — напишите учителю в Telegram, он подтверждает вручную.';
const SCHOOL_SITE_HINT_PREFIX =
  'Пока ждёте, можно посмотреть расписание на сайте школы: ';

export function PendingApprovalScreen() {
  const { config } = useAuthConfig();

  return (
    <section style={screenSectionStyle}>
      <h1 style={{ fontSize: 22, margin: 0 }}>{TITLE}</h1>
      <p style={screenExplanationStyle}>{PENDING_APPROVAL_MESSAGE}</p>
      <p style={screenExplanationStyle}>{LONG_WAIT_HINT}</p>
      {config?.schoolSiteUrl && (
        <p style={screenExplanationStyle}>
          {SCHOOL_SITE_HINT_PREFIX}
          <a href={config.schoolSiteUrl}>{config.schoolSiteUrl}</a>
        </p>
      )}
    </section>
  );
}
