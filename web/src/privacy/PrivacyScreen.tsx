// Публичная страница политики конфиденциальности (`/privacy`, ADR-0145) —
// без публичной ссылки на неё Google не переводит OAuth-приложение в режим
// «In production» (обязательное поле консоли Google Cloud), а статья 11
// Закона о защите частной жизни требует показать её там, где просят данные
// (ADR-0155). Текст — privacyPolicyText.ts, юридический и меняется вместе с
// набором данных, которые кабинет хранит; этот файл только раскладывает его
// по DOM (тот же приём, что RichText.tsx — данные отдельно от разметки).
// Публичный маршрут вне RequireAuth: открыт и гостю, и вошедшему, без
// редиректа — ссылка на политику не должна выкидывать из кабинета того, кто
// уже вошёл.
//
// Единственный раздел не из констант — «Кто отвечает за данные»: имя и
// контакт школа вводит сама (GET /auth/config). Пока они грузятся, на его
// месте скелетон, а остальной текст уже читается; не загрузились — страница
// отправляет к учителю (buildControllerParagraphs).
import type { ReactNode } from 'react';
import { EntryColumn } from '../components/EntryColumn';
import { RichText } from '../components/RichText';
import {
  noteStyle,
  screenColumnTitleStyle,
  screenExplanationStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { useAuthConfig } from '../auth/useAuthConfig';
import {
  PRIVACY_CONTROLLER_TITLE,
  buildControllerParagraphs,
} from './privacyControllerText';
import {
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
  PRIVACY_UPDATED_AT,
  type PrivacySection,
} from './privacyPolicyText';

function PrivacyBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={screenColumnTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyParagraphs({ paragraphs }: Pick<PrivacySection, 'paragraphs'>) {
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} style={screenExplanationStyle}>
          <RichText text={paragraph} />
        </p>
      ))}
    </>
  );
}

// Заголовок один и тот же в обоих состояниях: под ним меняется только тело
// (скелетон → абзацы), иначе при загрузке настроек заголовок пересоздавался бы.
function ControllerSection() {
  const { config, status } = useAuthConfig();

  return (
    <PrivacyBlock title={PRIVACY_CONTROLLER_TITLE}>
      {status === 'loading' ? (
        <SkeletonLines widths={['80%', '55%']} />
      ) : (
        <PrivacyParagraphs
          paragraphs={buildControllerParagraphs(status === 'ok' ? config : null)}
        />
      )}
    </PrivacyBlock>
  );
}

export default function PrivacyScreen() {
  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{PRIVACY_TITLE}</h1>
      <p style={noteStyle}>{PRIVACY_UPDATED_AT}</p>
      <p style={screenExplanationStyle}>
        <RichText text={PRIVACY_INTRO} />
      </p>
      <ControllerSection />
      {PRIVACY_SECTIONS.map(({ title, paragraphs }) => (
        <PrivacyBlock key={title} title={title}>
          <PrivacyParagraphs paragraphs={paragraphs} />
        </PrivacyBlock>
      ))}
    </EntryColumn>
  );
}
