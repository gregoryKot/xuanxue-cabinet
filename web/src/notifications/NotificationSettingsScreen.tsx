// Экран «Настройки уведомлений» (`/notifications/settings`, ADR-0162) — всё, что
// человек решает про уведомления, в одном месте: на какое устройство приходит
// push (PushNotificationsSection.tsx, ADR-0092), о каких занятиях напоминать
// (блок LessonScopeSection.tsx, только тем, у кого есть вид про занятие) и что
// именно присылать (NotificationPrefsSection.tsx; под «Занятие скоро» — поле «За
// сколько напомнить», LessonReminderField.tsx). Снимок настроек напоминаний
// экран грузит один раз (useReminderSync.ts, ADR-0185) и отдаёт обоим блокам:
// на один `GET` два потребителя и одна запись за раз на весь экран.
// «Профиль» ведёт сюда карточкой, а лента — ссылкой внизу. Открыт любой
// роли, как лента (screenAccess.ts): виды ограничены ролями человека, не гвардом
// маршрута. «Назад» — обычная ссылка в ленту, как «Вернуться к очереди проверки»
// на экране работы ученика.
import { Link } from 'react-router-dom';
import { backLinkStyle } from '../components/editorLayout';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { LessonReminderField } from './LessonReminderField';
import { LessonScopeSection } from './LessonScopeSection';
import { NotificationPrefsSection } from './NotificationPrefsSection';
import { NOTIFICATIONS_SCREEN_PATH } from './notificationPaths';
import { PushNotificationsSection } from './PushNotificationsSection';
import { useReminderSync } from './useReminderSync';

const TITLE = 'Настройки уведомлений';
const EXPLANATION = 'Какие уведомления получать и на какое устройство.';
const BACK_LABEL = 'Вернуться к уведомлениям';

export default function NotificationSettingsScreen() {
  const sync = useReminderSync();

  return (
    <section style={screenSectionStyle}>
      <Link to={NOTIFICATIONS_SCREEN_PATH} style={backLinkStyle}>
        {BACK_LABEL}
      </Link>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />
      <PushNotificationsSection />
      <LessonScopeSection sync={sync} />
      <NotificationPrefsSection
        settingsForKind={{ lesson_soon: <LessonReminderField sync={sync} /> }}
      />
    </section>
  );
}
