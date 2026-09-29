// Публичная страница «Доступность» (`/accessibility`, ADR-0158) — заявление о
// доступности сайта, которое правила равных прав людей с инвалидностью
// (пункт 35ה) требуют держать в заметном месте сайта: что сделано и на какой
// адрес написать, если чего-то не хватает. Каркас и загрузка контакта общие с
// `/privacy` (legal/LegalPage.tsx, legal/SchoolContactSection.tsx); текст —
// accessibilityText.ts.
//
// Публичный маршрут вне RequireAuth, как `/privacy`: открыт и гостю, и
// вошедшему, без редиректа. Контакт идёт первым разделом: главное, ради чего
// человек сюда пришёл, — куда написать, и скринридер находит его по заголовку.
import { LegalLink } from '../legal/LegalLink';
import { LegalPage, LegalSections } from '../legal/LegalPage';
import { SchoolContactSection } from '../legal/SchoolContactSection';
import {
  ACCESSIBILITY_CONTACT_TITLE,
  ACCESSIBILITY_INTRO,
  ACCESSIBILITY_SECTIONS,
  ACCESSIBILITY_TITLE,
  ACCESSIBILITY_UPDATED_AT,
  buildAccessibilityContactParagraphs,
} from './accessibilityText';

export default function AccessibilityScreen() {
  return (
    <LegalPage
      title={ACCESSIBILITY_TITLE}
      updatedAt={ACCESSIBILITY_UPDATED_AT}
      intro={ACCESSIBILITY_INTRO}
    >
      <SchoolContactSection
        title={ACCESSIBILITY_CONTACT_TITLE}
        buildParagraphs={buildAccessibilityContactParagraphs}
      />
      <LegalSections sections={ACCESSIBILITY_SECTIONS} />
      <LegalLink page="privacy" />
    </LegalPage>
  );
}
