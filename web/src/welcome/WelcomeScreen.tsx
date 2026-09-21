// Экран первого входа (`/welcome`, ADR-0044) — единственное, что кабинет
// спрашивает у человека, кроме самого входа: имя и фамилию. Пришедший по
// ссылке-приглашению до этого экрана не понимал, что произошло и что делать
// дальше (CLAUDE.md «Каждая фича объясняет откуда это и зачем») — теперь
// первое, что он видит после входа, объясняет и сразу даёт единственное
// действие. Облик — та же колонка на бумаге, что у экрана входа
// (components/EntryColumn.tsx, docs/adr/0031): это ещё «сени» кабинета, не
// сам кабинет — комментарий-«почему» в App.tsx объясняет, почему маршрут стоит
// вне AppShell. Логика — useProfileSetup.ts (CLAUDE.md «Логика вне компонентов»).
// Под формой — SecondLoginKey (ADR-0059, необязательный второй способ входа):
// стоит за тонкой линией после «Продолжить», чтобы не спорить с ней за
// единственное главное действие экрана (CLAUDE.md «Одно очевидное действие»).
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { MeDto } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { postLoginPath } from '../auth/returnTo';
import { SecondLoginKey } from '../auth/SecondLoginKey';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { FormServerError } from '../components/FormServerError';
import { PersonNameFields } from '../components/PersonNameFields';
import { SkeletonLines } from '../components/Skeleton';
import {
  noteStyle,
  screenExplanationStyle,
  screenHintStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { useProfileSetup } from './useProfileSetup';

const CONTINUE_HINT = 'Дальше — расписание занятий, ссылки на Zoom и записи.';
const SECOND_KEY_HINT = 'Необязательно. Вернуться к этому можно в «Профиле».';
const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const fullWidthStyle: CSSProperties = { width: '100%' };
// Приписка не сразу под объяснением экрана (та под заголовком выше), а под
// кнопкой — отрицательный отступ screenHintStyle тут не нужен, расстояние
// держит gap формы (тот же приём, что telegramHintStyle в profile/ProfileScreen.tsx).
const continueHintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };
// Тонкая линия перед SecondLoginKey — не LabeledDivider: тот подписывает
// «или» между двумя равными путями входа (LoginScreen.tsx), а здесь второй
// способ входа не альтернатива «Продолжить», а отдельный, необязательный шаг.
const dividerStyle: CSSProperties = {
  border: 0,
  borderTop: '1px solid var(--line)',
  margin: 0,
};

export default function WelcomeScreen() {
  const { me, applyMe } = useAuth();
  // Адрес возврата читается РОВНО ОДИН РАЗ за жизнь экрана: postLoginPath()
  // одноразовый (consumeReturnTo() стирает сохранённое при первом чтении,
  // auth/returnTo.ts), а читателей два — ранний <Navigate> ниже и переход
  // после сохранения. Пока профиль приезжал отдельным GET, второе чтение не
  // успевало; с ADR-0087 applyMe кладёт его синхронно, ре-рендер с
  // `needsProfile: false` идёт сразу, и второе чтение гарантированно отдаёт
  // «/» вместо того, куда человек шёл. Цена — перезагрузка `/welcome` до
  // сохранения адрес теряет; это дешевле, чем уводить не туда каждого.
  const [destination] = useState(postLoginPath);

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
    return <Navigate to={destination} replace />;
  }

  // Отдельный компонент, а не форма прямо здесь: он рождается один раз, уже
  // зная настоящее имя — useProfileSetup внутри читает `me.name` только при
  // самом первом рендере (useState), а WelcomeScreen выше уже успел
  // отрендериться раньше, пока `me` был `null`. Тем же заодно соблюдён
  // react-hooks/rules-of-hooks: свои хуки ProfileSetupForm вызывает
  // безусловно, без хука до раннего return в этом компоненте. Экран
  // «Профиль» (ADR-0045) решает ту же ловушку тем же приёмом —
  // profile/ProfileNameSection.tsx.
  return <ProfileSetupForm me={me} applyMe={applyMe} destination={destination} />;
}

interface ProfileSetupFormProps {
  me: MeDto;
  applyMe: (next: MeDto) => void;
  /** Уже прочитанный адрес возврата — см. WelcomeScreen выше. */
  destination: string;
}

function ProfileSetupForm({ me, applyMe, destination }: ProfileSetupFormProps) {
  // useNavigate — здесь, не в useProfileSetup.ts: куда идти после сохранения
  // решает экран (хук теперь общий с «Профилем», который никуда не уходит).
  const navigate = useNavigate();
  const setup = useProfileSetup(
    me.name,
    applyMe,
    () => void navigate(destination, { replace: true }),
  );

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void setup.submit();
  }

  // SecondLoginKey.tsx дожидается этого до ухода вкладки в Telegram
  // (ADR-0059): человек мог набрать имя и тут же нажать «Связать Telegram» —
  // черновик не должен пропасть. Заодно, если имя сохранилось, needsProfile
  // снимается ещё до перехода — вернувшись из Telegram, человек попадёт уже
  // в кабинет, а не на этот же экран (telegram/TelegramLinkButton.tsx).
  async function saveNameBeforeLink(): Promise<void> {
    await setup.save();
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
      <hr style={dividerStyle} />
      <SecondLoginKey me={me} onBeforeLink={saveNameBeforeLink} />
      <p style={noteStyle}>{SECOND_KEY_HINT}</p>
    </EntryColumn>
  );
}
