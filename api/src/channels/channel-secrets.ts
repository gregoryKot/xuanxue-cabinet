// Вычищает секрет канала из текста ошибки провайдера до записи в базу и до
// лога (SECURITY §5–6): `deliveries.error` шифруется целиком, но токен в
// открытом виде успевает попасть в саму текстовую ошибку («bot<token>» в URL
// Telegram, «access_token=…» у ВК) раньше шифрования — эту дыру закрывает
// именно scrub, не шифрование записи.
import { isVkChannelConfig, type ChannelConfig } from '@xuanxue/shared';

const SECRET_PLACEHOLDER = '[секрет]';
const ACCESS_TOKEN_RE = /access_token=[^&\s]+/g;

/**
 * `botToken` — секрет уровня приложения (`BOT_TOKEN`), не поле `config`
 * конкретного канала, поэтому передаётся отдельным параметром, а не читается
 * из `config`. Вызывающий (`ChannelsService`) уже знает оба значения.
 */
export function scrubChannelSecrets(
  text: string,
  config: ChannelConfig,
  botToken?: string,
): string {
  let out = text;
  if (isVkChannelConfig(config) && config.token) {
    out = out.split(config.token).join(SECRET_PLACEHOLDER);
  }
  if (botToken) {
    out = out.split(botToken).join(SECRET_PLACEHOLDER);
  }
  return out.replace(ACCESS_TOKEN_RE, `access_token=${SECRET_PLACEHOLDER}`);
}
