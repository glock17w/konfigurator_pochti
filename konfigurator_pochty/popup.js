let mails = [];
let currentFilter = "all";

function show(label) {
  currentFilter = label;
  const listEl = document.getElementById("list");
  if (!listEl) return;

  let html = "";
  for (let i = 0; i < mails.length; i++) {
    if (label === "all" || mails[i].label === label) {
      html += `<p><b>${mails[i].subject}</b><br>${mails[i].from} (${mails[i].account})</p>`;
    }
  }

  listEl.innerHTML = html || "<p>Писем в этой категории пока нет</p>";
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
      const preview = truncate(mails[i].subject, 45);
      html += `
        <details style="padding: 5px 0; border-bottom: 1px solid #eee; cursor: pointer;">
          <summary style="font-size: 12px; list-style: none;">
            <b>${mails[i].from}</b> — <span style="color: #555;">${preview}</span>
          </summary>
          <div style="margin-top: 5px; font-size: 12px; color: #222; background: #f9f9f9; padding: 6px; border-radius: 4px;">
            ${mails[i].subject}
          </div>
        </details>
      `;
    }
  }

  listEl.innerHTML = html || "<p>Писем в этой категории пока нет</p>";
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
    btnAll: "all",
    btnSuspicious: "suspicious",
    btnWork: "work",
    btnPersonal: "personal",
    btnNewsletter: "newsletter"
  };

  for (const [id, filter] of Object.entries(buttons)) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => show(filter));
    } else {
      console.warn(`Кнопка с id="${id}" не найдена в popup.html`);
    }
  }

  initPopup();
});
