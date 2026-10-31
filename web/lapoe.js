// ---------------------------------------------------------------------------
// LaPoe live chat
//
// 1. In your LaPoe dashboard (https://lapoe.app), open the Mini App section
//    and copy your key (the data-lapoe-key value, it starts with lp_).
// 2. Paste it below and `npx tgcloud push`.
// 3. In the dashboard, add your app's address (app<id>.tgcloud.ai) to the
//    allowed domains, or the chat will not load.
//
// The widget adds its own floating chat button; the Support button opens it too.
// ---------------------------------------------------------------------------
const LAPOE_KEY = 'lp_YOUR_KEY_HERE';

const configured = () => Boolean(LAPOE_KEY) && !LAPOE_KEY.startsWith('lp_YOUR');

export function initLaPoe() {
  if (!configured() || document.querySelector('script[data-lapoe-key]')) return;
  const script = document.createElement('script');
  script.src = 'https://lapoe.app/widget.js';
  script.setAttribute('data-lapoe-key', LAPOE_KEY);
  script.defer = true;
  document.head.appendChild(script);
}

export function openSupport() {
  if (window.LaPoe?.open) {
    window.LaPoe.open();
    return;
  }
  window.Telegram?.WebApp?.showAlert(configured()
    ? 'Support chat is still loading. Try again in a moment.'
    : 'Support chat is not set up yet.');
}
