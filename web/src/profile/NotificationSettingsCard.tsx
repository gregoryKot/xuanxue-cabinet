// Вход в «Настройки уведомлений» с «Профиля» (ADR-0162): карточка-переход, как
// «Приложение на телефоне» и «Сбои» рядом (SectionLink.tsx). Сами переключатели
// и push жили на «Профиле» (ADR-0045) и делали его длиннее экрана телефона.
// Приписка называет то, что человек там найдёт, — и только то, что у него
// есть: выбора «о каких занятиях» у штата нет (`hasLessonScopedKinds`), а
// обещанная и не найденная строка читалась бы пропавшей настройкой.
import { defaultNotifications, hasLessonScopedKinds, type MeDto } from '@xuanxue/shared';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { NOTIFICATION_SETTINGS_PATH } from '../notifications/notificationPaths';

const TITLE = 'Уведомления';
const HINT = 'Что присылать, о каких занятиях и на какое устройство';
const HINT_WITHOUT_LESSONS = 'Что присылать и на какое устройство';

export function NotificationSettingsCard({ me }: { me: MeDto | null }) {
  // Пока `me` не пришёл, приписку выбрать нечем: скелетон по форме карточки.
  if (me === null) return <SkeletonList rows={1} h={64} />;
  const hint = hasLessonScopedKinds(defaultNotifications(me.roles))
    ? HINT
    : HINT_WITHOUT_LESSONS;
  return <SectionLink to={NOTIFICATION_SETTINGS_PATH} title={TITLE} hint={hint} />;
}
