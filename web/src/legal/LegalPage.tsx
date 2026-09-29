// Каркас юридических страниц без входа — `/privacy` и `/accessibility`
// (CLAUDE.md «Одна механика — один компонент»): колонка, заголовок, дата
// редакции, вступление и разделы с абзацами. Текст живёт в отдельных модулях
// (privacyPolicyText.ts, accessibilityText.ts), а здесь он раскладывается по
// DOM тем же приёмом, что RichText.tsx: данные отдельно от разметки. Раньше эти
// куски были приватными в PrivacyScreen.tsx — вторая страница скопировала бы
// их целиком, и jscpd поймал бы дубль.
import type { ReactNode } from 'react';
import { EntryColumn } from '../components/EntryColumn';
import { RichText } from '../components/RichText';
import {
  noteStyle,
  screenColumnTitleStyle,
  screenExplanationStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
}

interface LegalPageProps {
  title: string;
  /** Строка «Редакция от …» под заголовком. */
  updatedAt: string;
  intro: string;
  children: ReactNode;
}

export function LegalPage({ title, updatedAt, intro, children }: LegalPageProps) {
  // Вкладка называется по странице: у всех экранов один <title> из
  // index.html, и человек со скринридером слышал бы «Сюань-Сюэ» вместо
  // «Доступность» (WCAG 2.4.2).
  useDocumentTitle(title);

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{title}</h1>
      <p style={noteStyle}>{updatedAt}</p>
      <p style={screenExplanationStyle}>
        <RichText text={intro} />
      </p>
      {children}
    </EntryColumn>
  );
}

export function LegalBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={screenColumnTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

export function LegalParagraphs({ paragraphs }: Pick<LegalSection, 'paragraphs'>) {
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

export function LegalSections({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <>
      {sections.map(({ title, paragraphs }) => (
        <LegalBlock key={title} title={title}>
          <LegalParagraphs paragraphs={paragraphs} />
        </LegalBlock>
      ))}
    </>
  );
}
