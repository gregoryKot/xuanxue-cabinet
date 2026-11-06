// Неделя на экране «Занятия»: заголовок, строка с темой недели (ADR-0197) и
// ссылка на страницу «Тема недели», ниже — дни этой недели. Тема — число
// раздела: учитель видит её, не открывая ни одного занятия.
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassDto } from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { screenHintStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { LessonDayGroup } from './LessonDayGroup';
import { weekTopicOf, weekTopicSummary, type LessonWeekGroupData } from './weekTopic';

const WEEK_TOPIC_PATH = '/planning/week-topic';
const SET_LABEL = 'Задать тему';
const CHANGE_LABEL = 'Изменить';

const weekStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const headStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const summaryRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 16,
};
const weekHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
};

interface LessonWeekGroupProps {
  week: LessonWeekGroupData;
  classesById: Map<string, ClassDto>;
  onSelectLesson: (lessonId: string) => void;
}

export function LessonWeekGroup({
  week,
  classesById,
  onSelectLesson,
}: LessonWeekGroupProps) {
  const navigate = useNavigate();
  const summary = weekTopicSummary(week.lessons);
  const hasTopic = weekTopicOf(week.lessons) !== '';

  return (
    <div style={weekStyle}>
      <div style={headStyle}>
        <h2 style={weekHeadingStyle}>{week.heading}</h2>
        {summary && (
          <div style={summaryRowStyle}>
            <span style={screenHintStyle}>
              <RichText text={summary} />
            </span>
            <TextLinkButton
              onClick={() => void navigate(`${WEEK_TOPIC_PATH}/${week.key}`)}
            >
              {hasTopic ? CHANGE_LABEL : SET_LABEL}
            </TextLinkButton>
          </div>
        )}
      </div>
      {week.days.map((day) => (
        <LessonDayGroup
          key={day.key}
          group={day}
          classesById={classesById}
          onSelectLesson={onSelectLesson}
        />
      ))}
    </div>
  );
}
