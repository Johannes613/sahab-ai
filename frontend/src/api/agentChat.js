// The chat always talks to the real backend (the Gemini key lives there). Unlike the
// rest of the app it has no built-in mock, so it defaults to the local dev server.
const BASE = process.env.REACT_APP_API_URL ?? 'http://localhost:8000';

export async function sendChatMessage(message, history, sessionId) {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, session_id: sessionId }),
    });
  } catch (err) {
    throw new Error(`Could not reach the Sahab AI server${BASE ? ` at ${BASE}` : ''}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).detail || '';
    } catch (e) {
      /* body was not JSON */
    }
    throw new Error(`Chat error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}
