// Общий select «Ведущий» для ClassFormFields/LessonFormFields (CLAUDE.md
// «Одна механика — один компонент»): список из GET /users/teachers, пустой
// вариант — «— не указан —» (leaderId необязателен, снимается им же).
import type { TeacherOptionDto } from '@xuanxue/shared';
import { Field, inputStyle } from './Field';

interface LeaderFieldProps {
  value: string;
  onChange: (value: string) => void;
  teachers: TeacherOptionDto[];
  hint?: string;
}

export function LeaderField({ value, onChange, teachers, hint }: LeaderFieldProps) {
  return (
    <Field label="Ведущий" hint={hint}>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— не указан —</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
