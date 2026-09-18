// Имя человека внутри «Профиля» (ADR-0045) — та же форма и тот же хук, что
// на первом входе (`/welcome`, ADR-0044, components/PersonNameFields.tsx,
// welcome/useProfileSetup.ts): здесь человек остаётся на месте, поэтому
// третий параметр хука — тихая строка «Имя сохранено», а не переход.
//
// Та же ловушка, что решает WelcomeScreen.tsx (ProfileSetupForm): `me` из
// useAuth() приходит асинхронно, а useProfileSetup читает имя один раз, при
// первом рендере (useState). Родитель (ProfileScreen.tsx) держит проверку
// `me === null` у себя и рождает этот компонент только с настоящим именем.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { splitPersonName } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError } from '../components/FormServerError';
import { PersonNameFields } from '../components/PersonNameFields';
import { noteStyle, primaryActionStyle } from '../components/screenLayout';
import { useProfileSetup } from '../welcome/useProfileSetup';

const NAME_HINT = 'Это имя видит учитель в списках и при проверке работ.';
const SAVE_LABEL = 'Сохранить имя';
const SAVED_MESSAGE = 'Имя сохранено';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

interface ProfileNameSectionProps {
  initialName: string;
  refresh: () => Promise<void>;
}

export function ProfileNameSection({ initialName, refresh }: ProfileNameSectionProps) {
  const [saved, setSaved] = useState(false);
  const setup = useProfileSetup(initialName, refresh, () => setSaved(true));

  // Сравнение с исходным именем, не с «последним сохранённым»: после ошибки
  // кнопка обязана остаться доступной для повтора без нового изменения поля.
  const initial = splitPersonName(initialName);
  const trimmedFirstName = setup.firstName.trim();
  const hasChanges =
    trimmedFirstName !== initial.firstName || setup.lastName.trim() !== initial.lastName;
  const canSave = trimmedFirstName !== '' && hasChanges;

  function handleFirstNameChange(value: string): void {
    setSaved(false);
    setup.setFirstName(value);
  }

  function handleLastNameChange(value: string): void {
    setSaved(false);
    setup.setLastName(value);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void setup.submit();
  }

  return (
    <form onSubmit={handleSubmit} style={sectionStyle}>
      <PersonNameFields
        firstName={setup.firstName}
        lastName={setup.lastName}
        onFirstNameChange={handleFirstNameChange}
        onLastNameChange={handleLastNameChange}
      />
      <p style={noteStyle}>{NAME_HINT}</p>
      <FormServerError error={setup.error ? { message: setup.error } : null} />
      {saved && <p style={noteStyle}>{SAVED_MESSAGE}</p>}
      <Button
        type="submit"
        pending={setup.status === 'pending'}
        disabled={!canSave}
        style={primaryActionStyle}
      >
        {SAVE_LABEL}
      </Button>
    </form>
  );
}
