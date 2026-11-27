const SENDER_SELECTOR = '[aria-label*="@"]';

const WORK_DOMAINS = ['company.ru', 'gosuslugi.ru'];
let customDomains = [];

const NEWS_ADDRESS = /(noreply|no-reply|newsletter|news@|info@|mailer|digest|promo|marketing)/i;
const NEWS_SUBJECT = /(скидк|акци|распродаж|промокод|подборк|новинк|выгодн|дайджест)/i;

const IS_GMAIL = location.hostname === 'mail.google.com';
const ACCOUNT = IS_GMAIL ? 'Gmail' : 'Яндекс';
console.log('content.js v1.1 загружен, ящик:', ACCOUNT);
const URGENT = /(срочно|ваш аккаунт.*(заблокирован|взломан)|подтвердите|уточните|немедленно|последнее предупреждение|доступ ограничен|выигрыш|блокировка|заблокирован|истекает срок|истечение срока|задолженност|досудебн|взыскани|подозрительн.{0,10}транзакц)/i;
const BRANDS = {
  'яндекс': ['yandex.ru', 'yandex.com', 'ya.ru'],
  'сбер': ['sberbank.ru', 'sber.ru'],
  'тинькофф': ['tinkoff.ru', 'tbank.ru'],
  'т-банк': ['tinkoff.ru', 'tbank.ru'],
  'госуслуги': ['gosuslugi.ru'],
  'почта россии': ['pochta.ru'],
};

function getDomain(email) {
  const m = (email || '').match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function classify(name, email, subject) {
  const domain = getDomain(email);
  const lowName = (name || '').toLowerCase();

  if (URGENT.test(subject)) return 'suspicious';
  if (domain) {
    for (const [brand, domains] of Object.entries(BRANDS)) {
      if (lowName.includes(brand) && !domains.some(d => domain === d || domain.endsWith('.' + d))) {
        return 'suspicious';
      }
    }
  }
  const workList = [...WORK_DOMAINS, ...customDomains];
  if (domain && workList.some(d => domain === d || domain.endsWith('.' + d))) return 'work';
  if (NEWS_ADDRESS.test(email || '') || NEWS_SUBJECT.test(subject)) return 'newsletter';
  return 'personal';
}

const LABELS = {
  work: ['Работа', 'ms-work'],
  personal: ['Личное', 'ms-personal'],
  newsletter: ['Рассылка', 'ms-news'],
  suspicious: ['Подозрительное', 'ms-phish'],
};


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

function labelMail(senderEl, name, email, subject, anchorEl) {
  const type = classify(name, email, subject);
  const [text, cls] = LABELS[type];
  const badge = document.createElement('span');
  badge.className = 'ms-badge ' + cls;
  badge.textContent = text;
  const target = anchorEl && anchorEl.parentElement ? anchorEl : senderEl;
  target.parentElement.insertBefore(badge, target);

  return {
    from: email,
    subject: subject.trim(),
    label: type,
    account: ACCOUNT
  };
}

function processSender(senderEl) {
  const email = senderEl.getAttribute('aria-label') || '';
  const name = senderEl.textContent.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  if (!name || name.length <= 2) return null;
  if (senderEl.closest('[class*="vatar"]')) return null;

  const prev = senderEl.previousElementSibling;
  if (prev && prev.classList.contains('ms-badge')) return null;

  const row = getRow(senderEl, email);
  if (row.querySelector('.ms-badge')) return null;

  return labelMail(senderEl, name, email, row.textContent || '');
}

function processGmailRow(row) {
  if (row.querySelector('.ms-badge')) return null;

  const senderEl = row.querySelector('span[email], [data-hovercard-id*="@"]');
  if (!senderEl) return null;

  const email = senderEl.getAttribute('email')
    || senderEl.getAttribute('data-hovercard-id') || '';
  const name = senderEl.getAttribute('name') || senderEl.textContent.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;

  const subjectEl = row.querySelector('.bog');
  const subject = subjectEl ? subjectEl.textContent : (row.textContent || '');

  return labelMail(senderEl, name, email, subject, subjectEl);
}

async function saveMailsBatch(newMails) {
  if (newMails.length === 0) return;

  const { mails = [] } = await chrome.storage.local.get({ mails: [] });
  let isUpdated = false;

  for (const item of newMails) {
    const found = mails.find(m =>
      m.from === item.from && m.subject === item.subject && m.account === item.account);
    if (!found) {
      mails.unshift(item);
      isUpdated = true;
    } else if (found.label !== item.label) {
      found.label = item.label;
      isUpdated = true;
    }
  }

  if (isUpdated) {
    await chrome.storage.local.set({ mails: mails.slice(0, 200) });
  }
}

function run() {
  const foundMails = [];

  if (IS_GMAIL) {
    const rows = document.querySelectorAll('tr.zA, tr[role="row"]');
    console.log('Gmail: строк найдено', rows.length);
    rows.forEach(row => {
      const mailData = processGmailRow(row);
      if (mailData) foundMails.push(mailData);
    });
  } else {
    document.querySelectorAll(SENDER_SELECTOR).forEach(el => {
      const mailData = processSender(el);
      if (mailData) foundMails.push(mailData);
    });
  }

  saveMailsBatch(foundMails);
}

let timer = null;
function scheduleRun() {
  clearTimeout(timer);
  timer = setTimeout(run, 300);
}

function relabel() {
  document.querySelectorAll('.ms-badge').forEach(b => b.remove());
  scheduleRun();
}

chrome.storage.local.get({ workDomains: [] }).then(d => {
  customDomains = d.workDomains || [];
  relabel();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.workDomains) {
    customDomains = changes.workDomains.newValue || [];
    relabel();
  }
});

new MutationObserver(scheduleRun).observe(document.body, {
  childList: true,
  subtree: true
});
window.addEventListener('hashchange', scheduleRun);
scheduleRun();