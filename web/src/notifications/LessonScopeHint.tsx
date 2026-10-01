// Подсказка в ленте «выберите свои занятия» (ADR-0162, п. 5): пока человек
// ничего не отмечал, ему приходят напоминания обо ВСЕХ занятиях школы — по
// стартовому расписанию шестнадцать в неделю. Лента — то место, где он
// спрашивает «почему мне это пишут», поэтому ответ и выход стоят здесь, над
// самой лентой, а не только в «Настройках уведомлений». Главное действие —
// «Выбрать занятия» (ведёт в настройки), второе — «Оставить все»: одно нажатие
// записывает «все» как осознанный выбор, и подсказка больше не возвращается.
//
// Карточка необязательная, поэтому ничего не рисует, пока нет ответа, и
// молчит при сбое загрузки: баннер ошибки ленты не должен говорить про
// второстепенные данные. Скелетона нет — на месте карточки не пустота, а сама
// лента. Данные — useLessonScope.ts (один запрос на экран, у штата его нет:
// вида про занятие у него нет). «Оставить все» перерисовывает карточку из
// ответа `PUT` (ADR-0087), второго `GET` нет.
import type { CSSProperties } from 'react';
import { ButtonLink } from '../components/ButtonLink';
import { RichText } from '../components/RichText';
import { dangerNoteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { cardStyle, metaStyle } from '../student/studentExamCardStyles';
import { scopeWithMode } from './lessonScopeEdit';
import { lessonScopeHintHeadline, weeklyLessonCount } from './lessonScopeHintText';
import { NOTIFICATION_SETTINGS_PATH } from './notificationPaths';
import { useLessonScope } from './useLessonScope';

const REGION_LABEL = 'О каких занятиях напоминать';
const EXPLANATION = 'Отметьте свои — и лишнего не будет.';
const CHOOSE_LABEL = 'Выбрать занятия';
const KEEP_ALL_LABEL = 'Оставить все';

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
const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 20px',
  marginTop: 4,
};

export function LessonScopeHint() {
  const { scope, classes, scopeChosen, saving, saveError, save } = useLessonScope();
  // Нет данных (загрузка, сбой, штат) или человек уже выбирал — карточки нет.
  if (scope === null || scopeChosen !== false) return null;
  const weeklyCount = weeklyLessonCount(classes);
  if (weeklyCount === 0) return null;

  return (
    <aside aria-label={REGION_LABEL} style={hintCardStyle}>
      <p style={headlineStyle}>
        <RichText text={lessonScopeHintHeadline(weeklyCount)} />
      </p>
      <p style={explanationStyle}>{EXPLANATION}</p>
      <div style={actionsStyle}>
        <ButtonLink to={NOTIFICATION_SETTINGS_PATH}>{CHOOSE_LABEL}</ButtonLink>
        <TextLinkButton
          disabled={saving}
          onClick={() => void save(scopeWithMode(scope, classes, 'all'))}
        >
          {KEEP_ALL_LABEL}
        </TextLinkButton>
      </div>
      {saveError && (
        <p role="alert" style={dangerNoteStyle}>
          {saveError}
        </p>
      )}
    </aside>
  );
}
