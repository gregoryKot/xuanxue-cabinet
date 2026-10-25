// Адрес экрана «Оплаты» — одна константа на маршрут (routeModules.ts), доступ
// и корень бухгалтера (screenAccess.ts), пункты меню (navItems.ts) и вход из
// «Учеников» (PeopleScreen.tsx). Отдельным файлом без импортов — по образцу
// install/installPath.ts: screenAccess.ts не должен тянуть экран (import-x/no-cycle).
export const PAYMENTS_SCREEN_PATH = '/payments';
