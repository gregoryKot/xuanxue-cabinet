// Экран `/wiki` — мост от входа в кабинет к серверному адресу входа из wiki
// (ADR-0183). Человека здесь не задерживаем: пока вкладка уходит на сервер,
// показываем заготовку; тупик — только когда уходить некуда. Логика —
// useWikiResume.ts.
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { useWikiResume } from './useWikiResume';

const UNAVAILABLE_TITLE = 'Не получилось открыть страницу';
const UNAVAILABLE_MESSAGE = 'Откройте её ещё раз из wiki.';
const SKELETON_WIDTHS = ['60%', '80%'];

export default function WikiResumeScreen() {
  const view = useWikiResume();

  return (
    <EntryColumn>
      {view === 'unavailable' ? (
        <>
          <h1 style={screenTitleStyle}>{UNAVAILABLE_TITLE}</h1>
          <p role="alert" style={screenExplanationStyle}>
            {UNAVAILABLE_MESSAGE}
          </p>
        </>
      ) : (
        <SkeletonLines widths={SKELETON_WIDTHS} />
      )}
    </EntryColumn>
  );
}
