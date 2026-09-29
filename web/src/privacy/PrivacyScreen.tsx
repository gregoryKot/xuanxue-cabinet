// Публичная страница политики конфиденциальности (`/privacy`, ADR-0145) —
// без публичной ссылки на неё Google не переводит OAuth-приложение в режим
// «In production» (обязательное поле консоли Google Cloud). Текст —
// privacyPolicyText.ts, юридический и меняется отдельным PR вместе с набором
// данных, которые кабинет хранит; этот файл только раскладывает его по DOM
// (тот же приём, что RichText.tsx — данные отдельно от разметки). Публичный
// маршрут вне RequireAuth: открыт и гостю, и вошедшему, без редиректа —
// ссылка на политику не должна выкидывать из кабинета того, кто уже вошёл.
import { EntryColumn } from '../components/EntryColumn';
import { RichText } from '../components/RichText';
import {
  noteStyle,
  screenColumnTitleStyle,
  screenExplanationStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import {
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
  PRIVACY_UPDATED_AT,
} from './privacyPolicyText';

export default function PrivacyScreen() {
  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{PRIVACY_TITLE}</h1>
      <p style={noteStyle}>{PRIVACY_UPDATED_AT}</p>
      <p style={screenExplanationStyle}>
        <RichText text={PRIVACY_INTRO} />
      </p>
      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 style={screenColumnTitleStyle}>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} style={screenExplanationStyle}>
              <RichText text={paragraph} />
            </p>
          ))}
        </section>
      ))}
    </EntryColumn>
  );
}
