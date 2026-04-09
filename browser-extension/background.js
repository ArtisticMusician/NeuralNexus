chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveToNeuralNexus",
    title: "Save to Neural Nexus",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveToNeuralNexus" && info.selectionText) {
    saveToNexus(info.selectionText);
  }
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl', 'apiKey'], (result) => {
      resolve({
        apiUrl: result.apiUrl || "http://localhost:3000",
        apiKey: result.apiKey || ""
      });
    });
  });
}

async function saveToNexus(text) {
  const settings = await getSettings();
  const endpoint = `${settings.apiUrl.replace(/\/$/, "")}/store`;
  
  try {
    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) {
      headers["X-API-Key"] = settings.apiKey;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        text, 
        category: "fact",
        metadata: { source: "browser_extension" }
      })
    });
    
    if (response.ok) {
      console.log("Memory stored successfully!");
    } else {
      console.error("Server responded with error:", response.status);
    }
  } catch (err) {
    console.error("Failed to save to Neural Nexus:", err);
  }
}
