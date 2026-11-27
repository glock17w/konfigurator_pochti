let mails = [];
let currentFilter = 'all';
let domains = [];
const DEFAULT_DOMAINS = ['company.ru', 'gosuslugi.ru'];

function normDomain(d) {
  return String(d || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^@/, '').replace(/^www\./, '').split('/')[0];
}

function renderDomains() {
  const el = document.getElementById('domains');
  el.innerHTML = domains.map((d, i) =>
    `<div class="dom"><span>${esc(d)}</span><button data-i="${i}" title="Удалить">✕</button></div>`
  ).join('') || '<p class="empty">Доменов нет - все письма будут «Личное».</p>';
  el.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', async () => {
    domains.splice(Number(b.dataset.i), 1);
    await chrome.storage.local.set({ workDomains: domains });
    renderDomains();
  }));
}

async function addDomain() {
  const input = document.getElementById('domainInput');
  const d = normDomain(input.value);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { input.focus(); return; }
  if (!domains.includes(d)) {
    domains.push(d);
    await chrome.storage.local.set({ workDomains: domains });
  }
  input.value = '';
  renderDomains();
}

const NAMES = {
  work: 'Работа', personal: 'Личное', newsletter: 'Рассылка', suspicious: 'Подозрительное'
};

function esc(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function truncate(text, max = 40) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function show(filter) {
  currentFilter = filter;
  const listEl = document.getElementById('list');
  if (!listEl) return;

  document.querySelectorAll('.tabs button[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
    const f = b.dataset.filter;
    const n = f === 'all' ? mails.length : mails.filter(m => m.label === f).length;
    b.querySelector('.cnt').textContent = n;
  });

  const items = mails.filter(m => filter === 'all' || m.label === filter);
  listEl.innerHTML = items.map(m => `
    <details class="mail">
      <summary>
        <span class="dot ${esc(m.label)}"></span>
        <b>${esc(m.from)}</b> — <span class="subj">${esc(truncate(m.subject, 45))}</span>
      </summary>
      <div class="full">
        ${esc(m.subject)}<br>
        <small>${esc(m.account)} · ${esc(NAMES[m.label] || m.label)}</small>
      </div>
    </details>`).join('') || '<p class="empty">Писем в этой категории пока нет.<br>Откройте почту и обновите страницу.</p>';
}

async function load() {
  try {
    const data = await chrome.storage.local.get({ mails: [] });
    mails = data.mails || [];
    const w = await chrome.storage.local.get({ workDomains: DEFAULT_DOMAINS });
    domains = w.workDomains || [];
  } catch (e) {
    console.error('Ошибка чтения storage:', e);
  }
  show(currentFilter);
  renderDomains();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.mails) {
    mails = changes.mails.newValue || [];
    show(currentFilter);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tabs button[data-filter]').forEach(btn =>
    btn.addEventListener('click', () => show(btn.dataset.filter)));

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!confirm('Очистить список писем?')) return;
    await chrome.storage.local.set({ mails: [] });
    mails = [];
    show(currentFilter);
  });

  document.getElementById('btnAddDomain').addEventListener('click', addDomain);
  document.getElementById('domainInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addDomain();
  });

  load();
});