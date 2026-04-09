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

async function requestNexus(endpoint, options = {}) {
  const settings = await getSettings();
  const baseUrl = settings.apiUrl.replace(/\/$/, "");
  const headers = { 
    "Content-Type": "application/json",
    ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {})
  };

  const response = await fetch(`${baseUrl}/${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

document.getElementById('searchBtn').addEventListener('click', async () => {
  const query = document.getElementById('query').value;
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = 'Searching...';

  try {
    const data = await requestNexus('recall', {
      method: "POST",
      body: JSON.stringify({ query, limit: 3 })
    });
    
    resultsDiv.innerHTML = data.memories.map(m => `
      <div class="memory">
        <strong>[${m.category}]</strong> ${m.text}
      </div>
    `).join('') || 'No memories found.';
  } catch (err) {
    resultsDiv.innerHTML = 'Error connecting to Nexus. Check settings.';
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const text = document.getElementById('manualText').value;
  if (!text) return;

  try {
    await requestNexus('store', {
      method: "POST",
      body: JSON.stringify({ text, category: "fact" })
    });
    document.getElementById('manualText').value = '';
    alert('Memory saved!');
  } catch (err) {
    alert('Error saving memory.');
  }
});

// Settings Management UI (simple version)
const toggleBtn = document.createElement('button');
toggleBtn.textContent = 'Settings';
toggleBtn.style.marginTop = '10px';
toggleBtn.onclick = () => {
  const url = prompt('API URL', 'http://localhost:3000');
  const key = prompt('API Key (if any)');
  if (url !== null) {
    chrome.storage.local.set({ apiUrl: url, apiKey: key || '' });
    alert('Settings saved!');
  }
};
document.body.appendChild(toggleBtn);
