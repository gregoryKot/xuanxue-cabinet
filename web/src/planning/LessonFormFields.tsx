// Поля листа занятия — вынесены из LessonSheet, чтобы сам лист не разрастался
// за 150 строк (CLAUDE.md «Файлы»). `classId` — только при создании
// (CreateLessonInput его принимает, UpdateLessonInput — нет, docs/PLAN.md §6
// п.3); ссылка/пароль Zoom на один раз и заметка — только при правке.
import { Link } from 'react-router-dom';
import { CLASS_LIMITS, type ClassDto } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { LessonFormState } from './lessonFormInput';

interface LessonFormFieldsProps {
  state: LessonFormState;
  setField: <K extends keyof LessonFormState>(key: K, value: LessonFormState[K]) => void;
  error: string | null;
  isCreate: boolean;
  classes: ClassDto[];
}

export function LessonFormFields({
  state,
  setField,
  error,
  isCreate,
  classes,
}: LessonFormFieldsProps) {
  // Разовое занятие привязывается к классу расписания — без единого класса
  // форме нечего показывать (ревью п.9): вместо тупика с пустым селектом —
  // объяснение и путь к решению.
  if (isCreate && classes.length === 0) {
    return (
      <p style={{ margin: 0 }}>
        Сначала добавьте занятие в расписании.{' '}
        <Link to="/schedule">Перейти в «Расписание»</Link>
      </p>
    );
  }

  return (
    <>
      {isCreate && (
        <Field label="Занятие расписания">
          <select
            style={inputStyle}
            value={state.classId}
            onChange={(e) => setField('classId', e.target.value)}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Тема" hint="Например «пятое занятие цикла „Шаги назад“»">
        <input
          style={inputStyle}
          value={state.topic}
          onChange={(e) => setField('topic', e.target.value)}
        />
      </Field>

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
          <Field
            label="Ссылка Zoom на это занятие"
            hint="Оставьте пустым — берётся из расписания"
          >
            <input
              style={inputStyle}
              value={state.zoomLinkOverride}
              onChange={(e) => setField('zoomLinkOverride', e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Пароль Zoom на это занятие">
            <input
              style={inputStyle}
              value={state.zoomPasswordOverride}
              onChange={(e) => setField('zoomPasswordOverride', e.target.value)}
            />
          </Field>
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
