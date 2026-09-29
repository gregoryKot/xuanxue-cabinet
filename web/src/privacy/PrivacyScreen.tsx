// Публичная страница политики конфиденциальности (`/privacy`, ADR-0145) —
// без публичной ссылки на неё Google не переводит OAuth-приложение в режим
// «In production» (обязательное поле консоли Google Cloud), а статья 11
// Закона о защите частной жизни требует показать её там, где просят данные
// (ADR-0155). Текст — privacyPolicyText.ts, юридический и меняется вместе с
// набором данных, которые кабинет хранит; каркас страницы общий с
// `/accessibility` (legal/LegalPage.tsx).
// Публичный маршрут вне RequireAuth: открыт и гостю, и вошедшему, без
// редиректа — ссылка на политику не должна выкидывать из кабинета того, кто
// уже вошёл.
//
// Единственный раздел не из констант — «Кто отвечает за данные»: имя и
// контакт школа вводит сама (GET /auth/config). Пока они грузятся, на его
// месте скелетон, а остальной текст уже читается; не загрузились — страница
// отправляет к учителю (buildControllerParagraphs).
import { LegalLink } from '../legal/LegalLink';
import { LegalPage, LegalSections } from '../legal/LegalPage';
import { SchoolContactSection } from '../legal/SchoolContactSection';
import {
  PRIVACY_CONTROLLER_TITLE,
  buildControllerParagraphs,
} from './privacyControllerText';
import {
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
  PRIVACY_UPDATED_AT,
} from './privacyPolicyText';

export default function PrivacyScreen() {
  return (
    <LegalPage title={PRIVACY_TITLE} updatedAt={PRIVACY_UPDATED_AT} intro={PRIVACY_INTRO}>
      <SchoolContactSection
        title={PRIVACY_CONTROLLER_TITLE}
        buildParagraphs={buildControllerParagraphs}
      />
      <LegalSections sections={PRIVACY_SECTIONS} />
      <LegalLink page="accessibility" />
    </LegalPage>
  );
}
