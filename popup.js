document.addEventListener('DOMContentLoaded', async () => {
  const modelSelect = document.getElementById('model-select');
  const promptInput = document.getElementById('user-prompt');
  const scrapeBtn = document.getElementById('scrape-btn');
  const statusBadge = document.getElementById('connection-status');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // 1. Load Models
  try {
    const response = await browser.runtime.sendMessage({ action: "fetchModels" });
    
    if (response.error) {
      statusBadge.textContent = "Ollama Offline";
      statusBadge.className = "status-badge offline";
      modelSelect.innerHTML = `<option>Connection Failed</option>`;
    } else {
      statusBadge.textContent = "Ollama Online";
      statusBadge.className = "status-badge online";
      
      modelSelect.innerHTML = '';
      response.models.forEach(m => {
        const option = document.createElement('option');
        option.value = m.name;
        option.textContent = m.name;
        modelSelect.appendChild(option);
      });
      
      modelSelect.disabled = false;
      scrapeBtn.disabled = false;
    }
  } catch (e) {
    statusBadge.textContent = "Error";
    statusBadge.className = "status-badge offline";
  }

  // 2. Load History
  loadHistory();

  // 3. Handle Scrape Click
  scrapeBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value;

    if (!prompt) return;

    // Get active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;

    // Send task to background
    browser.runtime.sendMessage({
      action: "startScrape",
      payload: {
        prompt,
        model,
        tabId: tabs[0].id
      }
    });

    promptInput.value = '';
    // Optimistically reload history (it will show 'processing')
    setTimeout(loadHistory, 100);
  });

  // Handle Clear History
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all history?')) {
      await browser.runtime.sendMessage({ action: "clearHistory" });
    }
  });

  // 4. Listen for updates from background
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "historyUpdated") {
      loadHistory();
    }
  });

  async function loadHistory() {
    const data = await browser.storage.local.get("history");
    const history = data.history || [];
    
    historyList.innerHTML = '';
    
    if (history.length === 0) {
      historyList.innerHTML = '<div style="text-align:center; color:#999; font-size:12px;">No history yet.</div>';
      return;
    }

    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      let statusColor = 'dot-processing';
      if (item.status === 'completed') statusColor = 'dot-completed';
      if (item.status === 'failed') statusColor = 'dot-failed';

      div.innerHTML = `
        <div class="history-header">
          <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
          <span>${item.model}</span>
        </div>
        <div class="history-prompt">
          <span class="status-dot ${statusColor}"></span>
          ${escapeHtml(item.prompt)}
        </div>
        ${item.result ? `<div class="history-result">${escapeHtml(item.result)}</div>` : ''}
        ${item.status === 'failed' ? `<div class="history-result" style="color:red">${escapeHtml(item.result || 'Error')}</div>` : ''}
      `;
      historyList.appendChild(div);
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
  }
});
