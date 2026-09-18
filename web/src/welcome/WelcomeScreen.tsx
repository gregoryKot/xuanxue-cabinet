// Экран первого входа (`/welcome`, ADR-0044) — единственное, что кабинет
// спрашивает у человека, кроме самого входа: имя и фамилию. Пришедший по
// ссылке-приглашению до этого экрана не понимал, что произошло и что делать
// дальше (CLAUDE.md «Каждая фича объясняет откуда это и зачем») — теперь
// первое, что он видит после входа, объясняет и сразу даёт единственное
// действие. Облик — та же колонка на бумаге, что у экрана входа
// (components/EntryColumn.tsx, docs/adr/0031): это ещё «сени» кабинета, не
// сам кабинет — комментарий-«почему» в App.tsx объясняет, почему маршрут стоит
// вне AppShell. Логика — useProfileSetup.ts (CLAUDE.md «Логика вне компонентов»).
import type { CSSProperties, FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { postLoginPath } from '../auth/returnTo';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { FormServerError } from '../components/FormServerError';
import { PersonNameFields } from '../components/PersonNameFields';
import { SkeletonLines } from '../components/Skeleton';
import {
  screenExplanationStyle,
  screenHintStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { useProfileSetup } from './useProfileSetup';

const CONTINUE_HINT = 'Дальше — расписание занятий, ссылки на Zoom и записи.';
const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const fullWidthStyle: CSSProperties = { width: '100%' };
// Приписка не сразу под объяснением экрана (та под заголовком выше), а под
// кнопкой — отрицательный отступ screenHintStyle тут не нужен, расстояние
// держит gap формы (тот же приём, что telegramHintStyle в profile/ProfileScreen.tsx).
const continueHintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };

export default function WelcomeScreen() {
  const { me, refresh } = useAuth();

  // `me` приходит асинхронно (соседние экраны переживают тот же `me === null`
  // через `?.`, например AppShell.tsx) — скелетон, а не пустая форма.
  if (me === null) {
    return (
      <EntryColumn>
        <SkeletonLines widths={['70%', '90%', '50%']} />
      </EntryColumn>
    );
  }

  // Уже назвался — здесь ему нечего делать (тот же приём, что hasSession в
  // LoginScreen.tsx: экран не держит того, кому на нём нечего делать).
  if (!me.needsProfile) {
    return <Navigate to={postLoginPath()} replace />;
  }

  // Отдельный компонент, а не форма прямо здесь: он рождается один раз, уже
  // зная настоящее имя — useProfileSetup внутри читает `me.name` только при
  // самом первом рендере (useState), а WelcomeScreen выше уже успел
  // отрендериться раньше, пока `me` был `null`. Тем же заодно соблюдён
  // react-hooks/rules-of-hooks: свои хуки ProfileSetupForm вызывает
  // безусловно, без хука до раннего return в этом компоненте. Экран
  // «Профиль» (ADR-0045) решает ту же ловушку тем же приёмом —
  // profile/ProfileNameSection.tsx.
  return <ProfileSetupForm initialName={me.name} refresh={refresh} />;
}

interface ProfileSetupFormProps {
  initialName: string;
  refresh: () => Promise<void>;
}

function ProfileSetupForm({ initialName, refresh }: ProfileSetupFormProps) {
  // useNavigate — здесь, не в useProfileSetup.ts: куда идти после сохранения
  // решает экран (хук теперь общий с «Профилем», который никуда не уходит).
  const navigate = useNavigate();
  const setup = useProfileSetup(
    initialName,
    refresh,
    () => void navigate(postLoginPath(), { replace: true }),
  );

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void setup.submit();
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>Как вас зовут?</h1>
      <p style={screenExplanationStyle}>
        Имя увидит учитель в списке учеников. Больше кабинет ничего не спросит.
      </p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <PersonNameFields
          firstName={setup.firstName}
          lastName={setup.lastName}
          onFirstNameChange={setup.setFirstName}
          onLastNameChange={setup.setLastName}
        />
        <FormServerError error={setup.error ? { message: setup.error } : null} />
        <Button
          type="submit"
          size="large"
          pending={setup.status === 'pending'}
          disabled={!setup.firstName.trim()}
          style={fullWidthStyle}
        >
          Продолжить
        </Button>
        <p style={continueHintStyle}>{CONTINUE_HINT}</p>
      </form>
    </EntryColumn>
  );
}
