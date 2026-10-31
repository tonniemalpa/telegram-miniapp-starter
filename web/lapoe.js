// ---------------------------------------------------------------------------
// LaPoe live chat
//
// TODO: paste the integration from your LaPoe dashboard (Mini App section).
// This file is the only place LaPoe is wired in. Keep openSupport() as the
// function the Support button calls, and make it open the LaPoe chat.
// ---------------------------------------------------------------------------

export function initLaPoe() {
  // Load the LaPoe chat here once the dashboard integration code is added.
}

export function openSupport() {
  if (window.LaPoe?.open) {
    window.LaPoe.open();
    return;
  }
  window.Telegram?.WebApp?.showAlert('Support chat is not set up yet.');
}
