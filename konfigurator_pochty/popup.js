let mails = [];
let currentFilter = "all";

function esc(text) {
  return String(text || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function truncate(text, maxLength = 40) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) + "..." : clean;
}

function show(label) {
  currentFilter = label;
  const listEl = document.getElementById("list");
  if (!listEl) return;

  let html = "";
  for (let i = 0; i < mails.length; i++) {
    if (label === "all" || mails[i].label === label) {
      const url = safeUrl(mails[i].url);
      html += `
        <details style="padding: 5px 0; border-bottom: 1px solid #eee; cursor: pointer;">
          <summary style="font-size: 12px; list-style: none;">
            <b>${esc(mails[i].from)}</b> — <span style="color: #555;">${esc(truncate(mails[i].subject, 45))}</span>
          </summary>
          <div style="margin-top: 5px; font-size: 12px; color: #222; background: #f9f9f9; padding: 6px; border-radius: 4px;">
            ${esc(mails[i].subject)}<br><small>${esc(mails[i].account)}</small>
            ${url
              ? `<br><a href="${esc(url)}" target="_blank" rel="noopener" style="color:#2563eb;">Открыть письмо ↗</a>`
              : ""}
          </div>
        </details>`;
    }
  }
  listEl.innerHTML = html || "<p>Писем в этой категории пока нет</p>";
}

let workDomains = [];

function normalizeDomain(raw) {
  let d = (raw || "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "");   // https://
  d = d.includes("@") ? d.split("@").pop() : d; // ivanov@company.ru -> company.ru
  d = d.split("/")[0].replace(/^www\./, "");
  return d;
}

function renderDomains() {
  const ul = document.getElementById("domainList");
  if (!ul) return;
  ul.innerHTML = workDomains.map((d, i) =>
    <li><span>${esc(d)}</span><button data-i="${i}" title="Удалить">×</button></li>
  ).join("") || "<li style='color:#777'>Пока нет своих доменов</li>";
  ul.querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    workDomains.splice(Number(b.dataset.i), 1);
    await chrome.storage.local.set({ workDomains });
    renderDomains();
  }));
}

async function addDomain() {
  const input = document.getElementById("domainInput");
  const err = document.getElementById("domainError");
  const d = normalizeDomain(input.value);
  err.textContent = "";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) {
    err.textContent = "Введите домен, например company.ru";
    return;
  }
  if (workDomains.includes(d)) {
    err.textContent = "Этот домен уже добавлен";
    return;
  }
  workDomains.push(d);
  await chrome.storage.local.set({ workDomains });
  input.value = "";
  renderDomains();
}

async function initDomains() {
  const data = await chrome.storage.local.get({ workDomains: [] });
  workDomains = data.workDomains || [];
  renderDomains();
  document.getElementById("btnAddDomain").addEventListener("click", addDomain);
  document.getElementById("domainInput").addEventListener("keydown", e => {
    if (e.key === "Enter") addDomain();
  });
}

async function initPopup() {
  try {
    const data = await chrome.storage.local.get({ mails: [] });
    mails = data.mails || [];
  } catch (e) {
    console.error("Ошибка чтения storage:", e);
  }
  show(currentFilter);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.mails) {
    mails = changes.mails.newValue || [];
    show(currentFilter);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const buttons = {
    btnAll: "all", btnSuspicious: "suspicious", btnWork: "work",
    btnPersonal: "personal", btnNewsletter: "newsletter"
  };
  for (const [id, filter] of Object.entries(buttons)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => show(filter));
  }
  initPopup();
  initDomains();
});

function safeUrl(url) {
  return /^https:\/\/(mail\.yandex\.ru|mail\.google\.com)\//.test(url || "") ? url : "";
}