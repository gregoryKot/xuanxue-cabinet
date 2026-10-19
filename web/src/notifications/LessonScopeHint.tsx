// Подсказка в ленте «отметьте свои занятия» (ADR-0185): пока у ученика не выбрано
// ни одного занятия, напоминаний о занятиях ему не приходит вовсе. Лента — то
// место, где он ждёт сообщения, поэтому причина и выход стоят над самой лентой,
// а не только в «Настройках уведомлений». Действие одно — «Выбрать занятия»
// (ведёт в настройки): выбор делается там, где виден весь список.
//
// Карточка необязательная, поэтому ничего не рисует, пока нет ответа, и молчит
// при сбое загрузки: баннер ошибки ленты не должен говорить про второстепенные
// данные. Скелетона нет — на месте карточки не пустота, а сама лента. Читает
// снимок напоминаний (useReminderSync.ts держит его на экране настроек) и
// ничего не пишет. У штата карточки нет и запросов за ней нет: вида про занятие
// у него нет (hasLessonSettings).
import type { CSSProperties } from 'react';
import { apiRoute } from '../api/apiRoute';
import { useAuth } from '../auth/AuthProvider';
import { ButtonLink } from '../components/ButtonLink';
import { RichText } from '../components/RichText';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { cardStyle, metaStyle } from '../student/studentExamCardStyles';
import { hasLessonSettings, isReminderHintDue } from './lessonReminderVisibility';
import { NOTIFICATION_SETTINGS_PATH } from './notificationPaths';
import { parseReminderSnapshot } from './reminderSyncState';
import { useNotificationPrefs } from './useNotificationPrefs';

const REGION_LABEL = 'О каких занятиях напоминать';
const HEADLINE = 'Напоминаний о занятиях **не будет**, пока вы не отметите свои';
const EXPLANATION = 'Отметьте занятия, о которых хотите знать, — напомним перед началом.';
const CHOOSE_LABEL = 'Выбрать занятия';
const LOAD_ERROR_MESSAGE = 'Не удалось загрузить выбор занятий. Попробуйте ещё раз.';

const hintCardStyle: CSSProperties = { ...cardStyle, gap: 8 };
const headlineStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 500,
  lineHeight: 1.4,
  color: 'var(--ink)',
};
// metaStyle (#55584e, а не --ink-soft): на --panel-warm --ink-soft держит
// только ~4.06:1, ниже AA 4.5 (studentExamCardStyles.ts).
const explanationStyle: CSSProperties = { ...metaStyle, margin: 0 };
const actionsStyle: CSSProperties = { marginTop: 4 };

function ReminderHintCard() {
  const { me } = useAuth();
  const { kinds, enabled } = useNotificationPrefs(me);
  const { data } = useAbortableFetch(
    (signal) => apiRoute('GET /me/notifications/lessons/sync', { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const snapshot = parseReminderSnapshot(data);
  if (!isReminderHintDue({ kinds, enabled, snapshot })) return null;

  return (
    <aside aria-label={REGION_LABEL} style={hintCardStyle}>
      <p style={headlineStyle}>
        <RichText text={HEADLINE} />
      </p>
      <p style={explanationStyle}>{EXPLANATION}</p>
      <div style={actionsStyle}>
        <ButtonLink to={NOTIFICATION_SETTINGS_PATH}>{CHOOSE_LABEL}</ButtonLink>
      </div>
    </aside>
  );
}

export function LessonScopeHint() {
  const { me } = useAuth();
  // Отдельный компонент под условием: хуки данных нельзя звать у штата.
  return hasLessonSettings(me) ? <ReminderHintCard /> : null;
}
