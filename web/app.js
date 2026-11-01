import { call, errorText } from './api.js';
import { features } from './features.js';
import { openSupport } from './lapoe.js';

const tg = window.Telegram?.WebApp;
const $ = (id) => document.getElementById(id);
const show = (el, visible = true) => { el.hidden = !visible; };

async function loadMe() {
  show($('me-loading'));
  show($('me-error'), false);
  try {
    const me = await call('getMe');
    $('greeting').textContent = `Hello, ${me.firstName || 'there'}`;
    $('visits').textContent = me.visits === 1
      ? 'Welcome! This is your first visit.'
      : `You have opened this app ${me.visits} times.`;
    show($('me'));
    return me;
  } catch (err) {
    $('me-error-text').textContent = errorText(err);
    show($('me-error'));
    return null;
  } finally {
    show($('me-loading'), false);
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
    $('fatal').textContent = 'Open this app from its bot inside Telegram.';
    show($('fatal'));
    show($('me-card'), false);
    return;
  }
  tg.ready();
  tg.expand();

  $('support-btn').addEventListener('click', openSupport);
  $('me-retry').addEventListener('click', loadMe);

  const me = await loadMe();
  await mountFeatures(me);
}

boot();
