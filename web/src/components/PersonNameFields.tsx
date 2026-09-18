// Общая форма имени — два поля «Имя»/«Фамилия», нужные первому входу
// (`/welcome`, ADR-0044, welcome/useProfileSetup.ts) и экрану «Профиль»
// (ADR-0045, profile/ProfileNameSection.tsx): один рисунок поля ввода на обе
// формы, а не две реализации одного ввода в разных файлах (CLAUDE.md «Одна
// механика — один компонент», jscpd). Разметка перенесена из WelcomeScreen.tsx
// дословно — внешний вид `/welcome` не поменялся ни на пиксель.
import { PERSON_NAME_PART_MAX } from '@xuanxue/shared';
import { Field, getInputStyle } from './Field';

interface PersonNameFieldsProps {
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
}

export function PersonNameFields({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
}: PersonNameFieldsProps) {
  return (
    <>
      <Field label="Имя">
        <input
          style={getInputStyle('large')}
          autoComplete="given-name"
          maxLength={PERSON_NAME_PART_MAX}
          required
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
        />
      </Field>
      <Field label="Фамилия" hint="Необязательно">
        <input
          style={getInputStyle('large')}
          autoComplete="family-name"
          maxLength={PERSON_NAME_PART_MAX}
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
        />
      </Field>
    </>
  );
}
