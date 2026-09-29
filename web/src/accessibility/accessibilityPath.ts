// Адрес страницы «Доступность» — маршрут и ссылки на неё (legal/LegalLink.tsx)
// берут его отсюда, разойтись им нельзя. В отличие от PRIVACY_PATH, живёт в
// web, а не в shared/: на эту страницу ссылаются только экраны кабинета, боту
// и api адрес не нужен.
export const ACCESSIBILITY_PATH = '/accessibility';
