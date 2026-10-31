// Home-screen card for the stars-payments recipe.
// Flow: createStarsInvoice -> Telegram.WebApp.openInvoice -> confirm on the server.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  id: 'stars-payments',
  title: 'Pay with Telegram Stars',

  async mount(el, { call, errorText, tg }) {
    const items = await call('starsCatalog');
    el.innerHTML = '<ul class="list"></ul><p class="status" hidden></p>';
    const list = el.querySelector('ul');
    const status = el.querySelector('.status');

    const setStatus = (text, kind = 'muted') => {
      status.className = `status ${kind}`;
      status.textContent = text;
      status.hidden = !text;
    };

    // The server is the source of truth: a purchase is paid only after the bot
    // received successful_payment. Poll briefly until it shows up.
    async function confirm(purchaseId) {
      for (let i = 0; i < 10; i++) {
        const p = await call('getStarsPurchase', { purchaseId });
        if (p.status === 'paid') return p;
        await sleep(1500);
      }
      return null;
    }

    for (const item of items) {
      const li = document.createElement('li');
      li.innerHTML = '<div><strong></strong><div class="muted small"></div></div>';
      li.querySelector('strong').textContent = item.title;
      li.querySelector('.small').textContent = item.description;
      const buy = document.createElement('button');
      buy.className = 'secondary small';
      buy.type = 'button';
      buy.textContent = `Buy for ${item.stars} ⭐`;
      buy.addEventListener('click', async () => {
        buy.disabled = true;
        setStatus('Opening payment…');
        try {
          const { purchaseId, invoiceLink } = await call('createStarsInvoice', { itemId: item.id });
          tg.openInvoice(invoiceLink, async (result) => {
            try {
              if (result === 'paid') {
                setStatus('Confirming payment…');
                const p = await confirm(purchaseId);
                if (p) {
                  setStatus(`Paid. Order ${p.reference}.`, 'success');
                  tg.HapticFeedback?.notificationOccurred('success');
                } else {
                  setStatus('Payment is taking longer than usual. You will get a message from the bot when it is confirmed.');
                }
              } else if (result === 'cancelled') {
                setStatus('');
              } else {
                setStatus('Payment did not go through.', 'error');
              }
            } catch (err) {
              setStatus(errorText(err), 'error');
            } finally {
              buy.disabled = false;
            }
          });
        } catch (err) {
          setStatus(errorText(err), 'error');
          buy.disabled = false;
        }
      });
      li.appendChild(buy);
      list.appendChild(li);
    }
  },
};
