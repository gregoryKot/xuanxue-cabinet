// «Скрыта ли карточка установки на этом устройстве» — localStorage, ключ на
// весь кабинет, не привязан к аккаунту: удобство браузера, не настройка
// профиля. Приватный режим Safari бросает на чтении/записи — та же оговорка,
// что у lib/formDraft.ts: без хранилища карточка просто продолжает
// показываться, ничего страшного не происходит.
const DISMISSED_KEY = 'xuanxue.installCard.dismissed';
const DISMISSED_VALUE = '1';

export function isInstallCardDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === DISMISSED_VALUE;
  } catch {
    return false;
  }
}

export function dismissInstallCard(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, DISMISSED_VALUE);
  } catch {
    // недоступное хранилище — карточка просто не запомнит выбор
  }
}
