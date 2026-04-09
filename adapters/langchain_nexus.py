import requests
import json
from typing import Optional, List, Dict, Any

class NeuralNexusClient:
    """Official Python client for the Neural Nexus Memory API."""
    
    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None, userid: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.default_userid = userid

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    def recall(self, query: str, limit: int = 5, userid: Optional[str] = None, max_tokens: Optional[int] = None) -> List[Dict[str, Any]]:
        """Search long-term memory."""
        payload = {
            "query": query, 
            "limit": limit, 
            "userid": userid or self.default_userid,
            "max_tokens": max_tokens
        }
        response = requests.post(
            f"{self.base_url}/recall", 
            json=payload, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.json().get("memories", [])

    def store(self, text: str, category: str = "fact", userid: Optional[str] = None, metadata: Optional[Dict] = None) -> bool:
        """Save a new memory."""
        payload = {
            "text": text, 
            "category": category, 
            "userid": userid or self.default_userid,
            "metadata": metadata or {}
        }
        response = requests.post(
            f"{self.base_url}/store", 
            json=payload, 
            headers=self._get_headers()
        )
        return response.status_code == 201

    def reinforce(self, memory_id: str, strength_adjustment: float = 0.05) -> bool:
        """Strengthen a specific memory."""
        payload = {"memory_id": memory_id, "strength_adjustment": strength_adjustment}
        response = requests.post(
            f"{self.base_url}/reinforce", 
            json=payload, 
            headers=self._get_headers()
        )
        return response.status_code == 200

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve memory replacement logs."""
        response = requests.get(
            f"{self.base_url}/audit", 
            params={"limit": limit}, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.json()

    def export_memories(self, userid: Optional[str] = None) -> str:
        """Export memories as NDJSON."""
        params = {"userid": userid or self.default_userid}
        response = requests.get(
            f"{self.base_url}/admin/export", 
            params=params, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.text

    def import_memories(self, data: str) -> Dict[str, Any]:
        """Import memories from NDJSON/JSON string."""
        response = requests.post(
            f"{self.base_url}/admin/import", 
            data=data, 
            headers={**self._get_headers(), "Content-Type": "text/plain"}
        )
        response.raise_for_status()
        return response.json()

# --- LangChain Tool Integration ---

try:
    from langchain.tools import tool

    @tool
    def recall_memory(query: str, limit: int = 5) -> str:
        """Search your long-term memory for relevant past information, preferences, or facts."""
        client = NeuralNexusClient()
        memories = client.recall(query, limit)
        if not memories:
            return "No relevant memories found."
        
        results = []
        for m in memories:
            results.append(f"- {m['text']} (Score: {m['metadata'].get('decayed_score', 'N/A')})")
        return "\n".join(results)

    @tool
    def store_memory(text: str, category: str = "fact") -> str:
        """Save important information, facts, or user preferences to long-term memory."""
        client = NeuralNexusClient()
        success = client.store(text, category)
        return "Memory stored successfully." if success else "Failed to store memory."

except ImportError:
    pass
