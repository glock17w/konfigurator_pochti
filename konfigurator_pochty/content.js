const SENDER_SELECTOR = '[aria-label*="@"]';
const WORK_DOMAINS = ['company.ru', 'gosuslugi.ru'];
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

// Текст строки без наших меток — чтобы тема не менялась после вставки метки
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

// Метку ставим один раз, но данные возвращаем ВСЕГДА
function labelMail(senderEl, row, name, email, subject) {
  const type = classify(name, email, subject);
  const [text, cls] = LABELS[type];

  if (!row.querySelector('.ms-badge') && senderEl.parentElement) {
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
  const keys = new Set(mails.map(m => `${m.account}|${m.from}|${m.subject}`));
  const fresh = [];
  for (const item of newMails) {
    const key = `${item.account}|${item.from}|${item.subject}`;
    if (!keys.has(key)) { keys.add(key); fresh.push(item); }
  }
  if (fresh.length) {
    await chrome.storage.local.set({ mails: [...fresh, ...mails].slice(0, MAX_MAILS) });
  }
}

// Записи идут строго по очереди — без гонок get/set
function queueSave(newMails) {
  saveChain = saveChain
    .then(() => saveMails(newMails))
    .catch(e => console.warn('Конфигуратор почты: не удалось сохранить', e));
}

function run() {
  if (!alive()) {            // расширение обновили/перезагрузили — тихо выходим
    if (observer) observer.disconnect();
    return;
  }
  const found = [];
  try {
    if (IS_GMAIL) {
      document.querySelectorAll('tr.zA, tr[role="row"]').forEach(row => {
        const d = processGmailRow(row);
        if (d) found.push(d);
      });
    } else {
      document.querySelectorAll(SENDER_SELECTOR).forEach(el => {
        const d = processSender(el);
        if (d) found.push(d);
      });
    }
  } catch (e) {
    console.warn('Конфигуратор почты: ошибка обработки', e);
  }
  queueSave(found);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 500);
}

observer = new MutationObserver(schedule);
observer.observe(document.body, { childList: true, subtree: true });
run();