const SENDER_SELECTOR = '[aria-label*="@"]';
const DEFAULT_DOMAINS = ['company.ru', 'gosuslugi.ru'];
let WORK_DOMAINS = DEFAULT_DOMAINS.slice();
const NEWS_ADDRESS = /(noreply|no-reply|newsletter|news@|info@|mailer|digest|promo|marketing)/i;
const NEWS_SUBJECT = /(скидк|акци|распродаж|промокод|подборк|новинк|выгодн|дайджест)/i;
const URGENT = /(срочно|ваш аккаунт.*(заблокирован|взломан)|подтвердите|уточните|немедленно|последнее предупреждение|доступ ограничен|выигрыш|блокировка|заблокирован|истекает срок|истечение срока|задолженност|досудебн|взыскани|подозрительн.{0,10}транзакц)/i;
const BRANDS = {
  'яндекс': ['yandex.ru', 'yandex.com', 'ya.ru'],
  'сбер': ['sberbank.ru', 'sber.ru'],
  'тинькофф': ['tinkoff.ru', 'tbank.ru'],
  'т-банк': ['tinkoff.ru', 'tbank.ru'],
  'госуслуги': ['gosuslugi.ru'],
  'почта россии': ['pochta.ru'],
};
const LABELS = {
  work: ['Работа', 'ms-work'],
  personal: ['Личное', 'ms-personal'],
  newsletter: ['Рассылка', 'ms-news'],
  suspicious: ['Подозрительное', 'ms-phish'],
};
const MAX_MAILS = 200;

const IS_GMAIL = location.hostname === 'mail.google.com';
const ACCOUNT = IS_GMAIL ? 'Gmail' : 'Яндекс';

let observer = null;
let timer = null;
let saveChain = Promise.resolve();

function alive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

function getDomain(email) {
  const m = (email || '').match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function inDomains(domain, list) {
  return list.some(d => domain === d || domain.endsWith('.' + d));
}

function classify(name, email, subject) {
  const domain = getDomain(email);
  const lowName = (name || '').toLowerCase();

  if (URGENT.test(subject)) return 'suspicious';
  if (domain) {
    for (const [brand, domains] of Object.entries(BRANDS)) {
      if (lowName.includes(brand) && !inDomains(domain, domains)) return 'suspicious';
    }
    if (inDomains(domain, WORK_DOMAINS)) return 'work';
  }
  if (NEWS_ADDRESS.test(email || '') || NEWS_SUBJECT.test(subject)) return 'newsletter';
  return 'personal';
}

function cleanText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.ms-badge').forEach(b => b.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function getRow(el, email) {
  let row = el;
  for (let i = 0; i < 8 && row.parentElement; i++) {
    const up = row.parentElement;
    const others = [...up.querySelectorAll(SENDER_SELECTOR)]
      .some(x => x.getAttribute('aria-label') !== email);
    if (others) break;
    row = up;
    if ((row.textContent || '').length >= 60) break;
  }
  return row;
}

function labelMail(senderEl, row, name, email, subject) {
  const type = classify(name, email, subject);
  const [text, cls] = LABELS[type];

  const existing = row.querySelector('.ms-badge');
  if (existing) {
    if (existing.textContent !== text) {
      existing.className = 'ms-badge ' + cls;
      existing.textContent = text;
    }
  } else if (senderEl.parentElement) {
    const badge = document.createElement('span');
    badge.className = 'ms-badge ' + cls;
    badge.textContent = text;
    senderEl.parentElement.insertBefore(badge, senderEl);
  }
  return { from: email, subject, label: type, account: ACCOUNT };
}

function processSender(senderEl) {
  const email = senderEl.getAttribute('aria-label') || '';
  const name = senderEl.textContent.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  if (!name || name.length <= 2) return null;
  if (senderEl.closest('[class*="vatar"]')) return null;

  const row = getRow(senderEl, email);
  return labelMail(senderEl, row, name, email, cleanText(row));
}

function processGmailRow(row) {
  const senderEl = row.querySelector('span[email], [data-hovercard-id*="@"]');
  if (!senderEl) return null;

  const email = senderEl.getAttribute('email') || senderEl.getAttribute('data-hovercard-id') || '';
  const name = senderEl.getAttribute('name') || senderEl.textContent.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;

  const subjectEl = row.querySelector('.bog');
  const subject = subjectEl ? subjectEl.textContent.replace(/\s+/g, ' ').trim() : cleanText(row);
  return labelMail(senderEl, row, name, email, subject);
}

async function saveMails(newMails) {
  if (!newMails.length || !alive()) return;
  const { mails = [] } = await chrome.storage.local.get({ mails: [] });
  const byKey = new Map(mails.map(m => [`${m.account}|${m.from}|${m.subject}`, m]));
  const fresh = [];
  let changed = false;
  for (const item of newMails) {
    const key = `${item.account}|${item.from}|${item.subject}`;
    const old = byKey.get(key);
    if (!old) { byKey.set(key, item); fresh.push(item); }
    else if (old.label !== item.label) { old.label = item.label; changed = true; }
  }
  if (fresh.length || changed) {
    await chrome.storage.local.set({ mails: [...fresh, ...mails].slice(0, MAX_MAILS) });
  }
}

function queueSave(newMails) {
  saveChain = saveChain
    .then(() => saveMails(newMails))
    .catch(e => console.warn('Конфигуратор почты: не удалось сохранить', e));
}

function run() {
  if (!alive()) {
    if (observer) observer.disconnect();
    return;
  }
  const found = [];
  const items = IS_GMAIL
    ? document.querySelectorAll('tr.zA, tr[role="row"]')
    : document.querySelectorAll(SENDER_SELECTOR);
  items.forEach(el => {
    try {
      const d = IS_GMAIL ? processGmailRow(el) : processSender(el);
      if (d) found.push(d);
    } catch (e) {
      console.warn('Конфигуратор почты: ошибка в строке', e);
    }
  });
  queueSave(found);
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; run(); }, 500);
}

function normDomain(d) {
  return String(d || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^@/, '').replace(/^www\./, '').split('/')[0];
}

async function loadDomains() {
  try {
    const { workDomains } = await chrome.storage.local.get({ workDomains: DEFAULT_DOMAINS });
    WORK_DOMAINS = (workDomains || []).map(normDomain).filter(Boolean);
  } catch (e) { }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.workDomains) {
    WORK_DOMAINS = (changes.workDomains.newValue || []).map(normDomain).filter(Boolean);
    run();
  }
});

observer = new MutationObserver(schedule);
observer.observe(document.body, { childList: true, subtree: true });
setInterval(run, 2000);
loadDomains().then(run);