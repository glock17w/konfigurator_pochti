let mails = [];
let currentFilter = 'all';

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
  } catch (e) {
    console.error('Ошибка чтения storage:', e);
  }
  show(currentFilter);
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

  load();
});