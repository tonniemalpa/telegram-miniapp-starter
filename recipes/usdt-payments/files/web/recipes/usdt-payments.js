// Home-screen card for the usdt-payments recipe.
// Flow: createUsdtPayment (server builds the USDT transfer) -> wallet signs it
// via TON Connect -> checkUsdtPayment until the server sees it on-chain.
import { getTonConnect, connectedAccount } from '../lib/ton-connect.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatUnits(units, decimals) {
  const n = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${n / base}.${frac}` : `${n / base}`;
}

export default {
  id: 'usdt-payments',
  title: 'Pay with USDT',

  async mount(el, { call, errorText, tg }) {
    const catalog = await call('usdtCatalog');
    el.innerHTML = `
      <div class="row"><span class="muted small network"></span><div id="usdt-connect-button"></div></div>
      <ul class="list"></ul>
      <p class="status" hidden></p>`;
    // Buyers only need a label on testnet; the wallet button speaks for itself.
    el.querySelector('.network').textContent = catalog.network === 'testnet' ? 'Testnet: no real money' : '';
    const list = el.querySelector('ul');
    const status = el.querySelector('.status');
    const setStatus = (text, kind = 'muted') => {
      status.className = `status ${kind}`;
      status.textContent = text;
      status.hidden = !text;
    };

    if (!catalog.configured) {
      setStatus('Set receiverAddress in tgcloud/lib/usdt.js to enable USDT payments.', 'error');
      return;
    }
    const wallet = getTonConnect('usdt-connect-button');
    if (!wallet) {
      setStatus('The wallet connector failed to load. Reopen the app.', 'error');
      return;
    }

    async function waitForPayment(payment) {
      for (let i = 0; i < 36; i++) {          // about 3 minutes
        setStatus(`Waiting for the network to confirm ${payment.reference}…`);
        await sleep(5000);
        try {
          const res = await call('checkUsdtPayment', { paymentId: payment.id });
          if (res.payment.status === 'paid') return true;
        } catch (err) {
          console.warn('checkUsdtPayment failed', err);
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
      pay.textContent = `Pay ${formatUnits(item.units, catalog.decimals)} USDT`;
      pay.addEventListener('click', async () => {
        const account = connectedAccount(wallet);
        if (!wallet.connected || !account) { setStatus('Connect a wallet first.', 'error'); return; }
        if (account.chain && account.chain !== catalog.chain) {
          setStatus(`Switch your wallet to ${catalog.network} and reconnect.`, 'error');
          return;
        }
        pay.disabled = true;
        try {
          setStatus('Preparing the payment…');
          const { payment, message } = await call('createUsdtPayment', { itemId: item.id, payerAddress: account.address });
          setStatus('Confirm the payment in your wallet. It also needs a little TON for the fee.');
          await wallet.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            network: catalog.chain,
            messages: [message],
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
