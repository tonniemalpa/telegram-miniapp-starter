// One shared TON Connect instance per page (used by the ton-payments and
// usdt-payments recipes). The first card that asks for it places the wallet button.
let ui = null;

export function getTonConnect(buttonRootId) {
  if (!window.TON_CONNECT_UI) return null;
  if (!ui) {
    ui = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: new URL('/tonconnect-manifest.json', location.origin).href,
      buttonRootId,
    });
  }
  return ui;
}

// The connected wallet's address ("0:…") and network ("-239" mainnet, "-3" testnet).
export function connectedAccount(wallet) {
  return wallet?.account ?? wallet?.wallet?.account ?? null;
}
