// Home-screen card for the ton-payments recipe.
// Flow: createTonPayment -> TON Connect transfer with the reference as comment
// -> checkTonPayment until the server sees it on-chain.
import { commentPayload } from '../lib/boc.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatTon(nano) {
  const n = BigInt(nano);
  const frac = (n % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${n / 1_000_000_000n}.${frac}` : `${n / 1_000_000_000n}`;
}

export default {
  id: 'ton-payments',
  title: 'Pay with TON',

  async mount(el, { call, errorText, tg }) {
    const catalog = await call('tonCatalog');
    el.innerHTML = `
      <div class="row"><span class="muted small network"></span><div id="ton-connect-button"></div></div>
      <ul class="list"></ul>
      <p class="status" hidden></p>`;
    el.querySelector('.network').textContent = catalog.network === 'testnet' ? 'Testnet: no real money' : 'Mainnet';
    const list = el.querySelector('ul');
    const status = el.querySelector('.status');
    const setStatus = (text, kind = 'muted') => {
      status.className = `status ${kind}`;
      status.textContent = text;
      status.hidden = !text;
    };

    if (!catalog.configured) {
      setStatus('Set receiverAddress in tgcloud/lib/ton.js to enable TON payments.', 'error');
      return;
    }
    if (!window.TON_CONNECT_UI) {
      setStatus('The wallet connector failed to load. Reopen the app.', 'error');
      return;
    }

    const wallet = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: new URL('/tonconnect-manifest.json', location.origin).href,
      buttonRootId: 'ton-connect-button',
    });

    const wrongChain = () => {
      const chain = wallet.wallet?.account?.chain;
      return Boolean(chain && chain !== catalog.chain);
    };

    async function waitForPayment(payment) {
      for (let i = 0; i < 36; i++) {          // about 3 minutes
        setStatus(`Waiting for the network to confirm ${payment.reference}…`);
        await sleep(5000);
        try {
          const res = await call('checkTonPayment', { paymentId: payment.id });
          if (res.payment.status === 'paid') return true;
        } catch (err) {
          console.warn('checkTonPayment failed', err);
        }
      }
      return false;
    }

    for (const item of catalog.items) {
      const li = document.createElement('li');
      li.innerHTML = '<strong></strong>';
      li.querySelector('strong').textContent = item.title;
      const pay = document.createElement('button');
      pay.className = 'secondary small';
      pay.type = 'button';
      pay.textContent = `Pay ${formatTon(item.priceNano)} TON`;
      pay.addEventListener('click', async () => {
        if (!wallet.connected) { setStatus('Connect a wallet first (button above).', 'error'); return; }
        if (wrongChain()) { setStatus(`Switch your wallet to ${catalog.network} and reconnect.`, 'error'); return; }
        pay.disabled = true;
        try {
          const payment = await call('createTonPayment', { itemId: item.id });
          setStatus('Confirm the payment in your wallet…');
          await wallet.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            network: catalog.chain,
            messages: [{
              address: catalog.receiverAddress,
              amount: payment.priceNano,
              payload: commentPayload(payment.reference),
            }],
          });
          if (await waitForPayment(payment)) {
            setStatus(`Paid. Reference ${payment.reference}.`, 'success');
            tg?.HapticFeedback?.notificationOccurred('success');
          } else {
            setStatus(`Still waiting for ${payment.reference}. You will get a message from the bot when it arrives.`);
          }
        } catch (err) {
          setStatus(err?.type ? errorText(err) : 'The payment was not sent.', 'error');
        } finally {
          pay.disabled = false;
        }
      });
      li.appendChild(pay);
      list.appendChild(li);
    }
  },
};
