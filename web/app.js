import { call, errorText } from './api.js';
import { features } from './features.js';
import { openSupport } from './lapoe.js';

const tg = window.Telegram?.WebApp;
const $ = (id) => document.getElementById(id);
const show = (el, visible = true) => { if (el) el.hidden = !visible; };

function showNotice(text, retry = false) {
  $('notice-text').textContent = text;
  show($('notice-retry'), retry);
  show($('notice'), Boolean(text));
}

// STARTER ONLY: fills the placeholder card in index.html. Delete it with the card.
function renderStarter(me) {
  if (!$('starter')) return;
  $('greeting').textContent = `Hello, ${me.firstName || 'there'}`;
  $('visits').textContent = me.visits === 1
    ? 'Welcome! This is your first visit.'
    : `You have opened this app ${me.visits} times.`;
  show($('starter'));
}

// getMe records the user and the visit (and runs new-user hooks such as admin alerts).
// Keep this call when you replace the starter screen; `me` is passed to every feature.
async function loadMe() {
  show($('loading'));
  showNotice('');
  try {
    const me = await call('getMe');
    renderStarter(me);
    return me;
  } catch (err) {
    showNotice(errorText(err), true);
    return null;
  } finally {
    show($('loading'), false);
  }
}

async function mountFeatures(me) {
  const root = $('features');
  for (const feature of features) {
    const card = document.createElement('section');
    card.className = 'card';
    card.dataset.feature = feature.id;
    const title = document.createElement('h2');
    title.textContent = feature.title;
    const body = document.createElement('div');
    card.append(title, body);
    root.appendChild(card);
    try {
      await feature.mount(body, { call, errorText, tg, me });
    } catch (err) {
      console.error(`Feature ${feature.id} failed`, err);
      body.innerHTML = '<p class="error"></p>';
      body.firstChild.textContent = errorText(err);
    }
  }
}

async function boot() {
  if (!tg?.initData) {
    show($('loading'), false);
    showNotice('Open this app from its bot inside Telegram.');
    return;
  }
  tg.ready();
  tg.expand();

  $('support-btn').addEventListener('click', openSupport);
  $('notice-retry').addEventListener('click', loadMe);

  const me = await loadMe();
  await mountFeatures(me);
}

boot();
