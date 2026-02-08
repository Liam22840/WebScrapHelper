const OLLAMA_API = "http://localhost:11434";

// Initialize storage if empty
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get("history").then((res) => {
    if (!res.history) {
      browser.storage.local.set({ history: [] });
    }
  });
});

// Handle messages from Popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchModels") {
    fetchModels().then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.action === "startScrape") {
    runScrapingTask(message.payload);
    sendResponse({ status: "started" });
    return false;
  }

  if (message.action === "clearHistory") {
    browser.storage.local.set({ history: [] }).then(() => {
      browser.runtime.sendMessage({ action: "historyUpdated" });
      sendResponse({ status: "cleared" });
    });
    return true;
  }
});

async function fetchModels() {
  try {
    const response = await fetch(`${OLLAMA_API}/api/tags`);
    const data = await response.json();
    return { models: data.models };
  } catch (error) {
    return { error: "Could not connect to Ollama. Is it running?" };
  }
}

async function runScrapingTask(payload) {
  const { prompt, model, tabId } = payload;
  const timestamp = new Date().toISOString();
  const id = Date.now().toString();

  // 1. Create initial history entry
  const newEntry = {
    id,
    timestamp,
    prompt,
    model,
    status: "processing",
    result: null,
    url: "..."
  };

  await addToHistory(newEntry);

  try {
    // 2. Get Content from Tab
    // Inject content script to ensure listener exists
    await browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });

    const tabResponse = await browser.tabs.sendMessage(tabId, { action: "getPageContent" });
    
    if (!tabResponse || !tabResponse.content) {
      throw new Error("Could not extract content from page.");
    }

    // 3. Call Ollama
    const systemPrompt = `You are a web scraping assistant. Analyze the provided web page text and extract information based strictly on the user's prompt. Return clear, concise text or JSON if requested.`;
    
    const finalPrompt = `Web Page Content:\n${tabResponse.content}\n\nUser Instruction:\n${prompt}`;

    const response = await fetch(`${OLLAMA_API}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: finalPrompt,
        system: systemPrompt,
        stream: false // Disable streaming for simpler background handling
      })
    });

    const data = await response.json();
    
    // 4. Update History with Success
    await updateHistory(id, "completed", data.response);

  } catch (error) {
    console.error("Scraping failed:", error);
    await updateHistory(id, "failed", error.message);
  }
}

// Storage Helpers
async function addToHistory(entry) {
  const data = await browser.storage.local.get("history");
  const history = data.history || [];
  history.unshift(entry); // Add to top
  await browser.storage.local.set({ history });
  // Notify popup to refresh if open
  browser.runtime.sendMessage({ action: "historyUpdated" });
}

async function updateHistory(id, status, result) {
  const data = await browser.storage.local.get("history");
  let history = data.history || [];
  
  history = history.map(item => {
    if (item.id === id) {
      return { ...item, status, result };
    }
    return item;
  });

  await browser.storage.local.set({ history });
  browser.runtime.sendMessage({ action: "historyUpdated" });
}
