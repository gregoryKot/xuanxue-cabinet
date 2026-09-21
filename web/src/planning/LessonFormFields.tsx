// Поля занятия — вынесены из LessonEditorForm.tsx (CLAUDE.md «Файлы»).
// `classId` — только при создании (docs/PLAN.md §6 п.3); теги, заметка и
// ссылка/пароль Zoom на один раз (LessonZoomFields.tsx) — только при правке.
import { Link } from 'react-router-dom';
import {
  CLASS_LIMITS,
  TAG_LIMITS,
  type ClassDto,
  type TeacherOptionDto,
} from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { LeaderField } from '../components/LeaderField';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { Select } from '../components/Select';
import { TagsField } from '../components/TagsField';
import { inheritedZoomHint } from './inheritedZoom';
import { LessonZoomFields } from './LessonZoomFields';
import type { LessonFormState } from './lessonFormInput';
import { textLinkStyle } from '../components/screenLayout';

// ADR-0075: тег — что было в этот вечер, его видит ученик; постоянный тег
// курса форма даты не показывает и не переписывает (ADR-0072).
const TAG_HINT = `Что разбирали в этот вечер: «дракон», «толчок руками» — через запятую, до ${TAG_LIMITS.perRecord}. Их видит ученик. Постоянный признак курса ставится в расписании.`;

interface LessonFormFieldsProps {
  state: LessonFormState;
  setField: <K extends keyof LessonFormState>(key: K, value: LessonFormState[K]) => void;
  error: string | null;
  isCreate: boolean;
  classes: ClassDto[];
  /** Учителя для select'а «Ведущий» (LessonEditorForm.tsx, аудит В4) — сбой
   * загрузки не прячет форму, только строка с ошибкой и повтором над списком. */
  teachers: TeacherOptionDto[];
  teachersError: string | null;
  onRetryTeachers: () => void;
}

export function LessonFormFields({
  state,
  setField,
  error,
  isCreate,
  classes,
  teachers,
  teachersError,
  onRetryTeachers,
}: LessonFormFieldsProps) {
  // Разовое занятие привязывается к классу расписания — без единого класса
  // форме нечего показывать (ревью п.9): вместо тупика с пустым селектом —
  // объяснение и путь к решению.
  if (isCreate && classes.length === 0) {
    return (
      <p style={{ margin: 0 }}>
        Сначала добавьте занятие в расписании.{' '}
        <Link to="/schedule" style={textLinkStyle}>
          Перейти в «Расписание»
        </Link>
      </p>
    );
  }

  return (
    <>
      {isCreate && (
        <Field label="Занятие расписания">
          <Select
            value={state.classId}
            onChange={(e) => setField('classId', e.target.value)}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Тема" hint="Например «пятое занятие цикла „Шаги назад“»">
        <input
          style={inputStyle}
          value={state.topic}
          onChange={(e) => setField('topic', e.target.value)}
        />
      </Field>
      {!isCreate && (
        <TagsField
          value={state.tagsText}
          onChange={(value) => setField('tagsText', value)}
          hint={TAG_HINT}
        />
      )}

      <Field label="Дата и время начала" error={error ?? undefined}>
        <input
          type="datetime-local"
          style={inputStyle}
          value={state.startsAtLocal}
          onChange={(e) => setField('startsAtLocal', e.target.value)}
        />
      </Field>

      <Field
        label="Длительность, минут"
        hint={`Число от ${CLASS_LIMITS.durationMinMin} до ${CLASS_LIMITS.durationMinMax}`}
      >
        <input
          type="text"
          inputMode="numeric"
          style={inputStyle}
          value={state.durationMinText}
          onChange={(e) => setField('durationMinText', e.target.value)}
        />
      </Field>

      {!isCreate && (
        <>
          {teachersError && (
            <LoadErrorBanner
              message={teachersError}
              onRetry={onRetryTeachers}
              retryLabel="Обновить"
            />
          )}
          <LeaderField
            value={state.leaderId}
            onChange={(leaderId) => setField('leaderId', leaderId)}
            teachers={teachers}
            hint="Если не указан — ведущий занятия из расписания"
          />
          <LessonZoomFields
            zoomLink={state.zoomLinkOverride}
            zoomPassword={state.zoomPasswordOverride}
            onChangeZoomLink={(value) => setField('zoomLinkOverride', value)}
            onChangeZoomPassword={(value) => setField('zoomPasswordOverride', value)}
            hint={inheritedZoomHint(classes.find((cls) => cls.id === state.classId))}
          />
          <Field label="Заметка" hint="Видна только вам">
            <textarea
              style={{ ...inputStyle, minHeight: 72 }}
              value={state.note}
              onChange={(e) => setField('note', e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  );
}
