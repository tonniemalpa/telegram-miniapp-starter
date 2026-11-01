// ---------------------------------------------------------------------------
// LaPoe live chat
//
// Setup (no code changes needed here):
// 1. In your LaPoe dashboard (https://lapoe.app), open the Mini App section and
//    copy the snippet. It looks like:
//    <script src="https://lapoe.app/widget.js" data-lapoe-key="lp_..." defer></script>
// 2. Paste it into web/index.html on the line under "LaPoe live chat".
// 3. In the dashboard, add your app address (https://app<id>.tgcloud.ai) to the
//    allowed domains, then `npx tgcloud push`.
//
// The widget shows its own floating chat button. The Support button in the
// header opens the same chat through openSupport() below.
// ---------------------------------------------------------------------------

export function openSupport() {
  if (window.LaPoe?.open) {
    window.LaPoe.open();
    return;
  }
  const installed = Boolean(document.querySelector('script[data-lapoe-key]'));
  window.Telegram?.WebApp?.showAlert(installed
    ? 'Support chat is still loading. Try again in a moment.'
    : 'Support chat is not set up yet.');
}
