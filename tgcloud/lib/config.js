// ---------------------------------------------------------------------------
// App settings. Edit, then `npx tgcloud push`.
// This file is committed to git: never put private keys or API secrets here.
// ---------------------------------------------------------------------------

export const config = {
  // Shown in bot messages. Also change <title> and the header in web/index.html.
  appName: 'My Mini App',

  // Printed by `npx tgcloud push`, e.g. https://app123456.tgcloud.ai/
  miniAppUrl: 'https://appXXXXXX.tgcloud.ai/',

  // Your numeric Telegram user ID (send /myid to the bot). Used for admin
  // commands and owner notifications. 0 = no admin.
  adminChatId: 0,
};

export function isConfigured(url = config.miniAppUrl) {
  return !url.includes('XXXXXX');
}
