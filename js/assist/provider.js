// assist/provider.js — AI-assist seam (v2 Fase E). Optioneel, opt-in. Output = suggesties.
// De deterministische kern werkt volledig zonder AI; dit is enkel voor rommelige vrije tekst.

export function nullProvider() {
  return { id: 'none', name: '—', available: () => false, async complete() { throw new Error('Geen AI-provider ingesteld'); } };
}

/** Voor tests / demo's: geeft een vaste tekst terug. */
export function mockProvider(text) {
  return { id: 'mock', name: 'Mock', available: () => true, async complete() { return text; } };
}

/**
 * BYOK: de gebruiker levert zijn eigen sleutel (lokaal bewaard). Calls gebeuren in de browser.
 * Endpoint/headers zijn configureerbaar; standaard een Anthropic-achtig messages-endpoint.
 */
export function byokProvider({ apiKey, endpoint, model, headers } = {}) {
  const url = endpoint || 'https://api.anthropic.com/v1/messages';
  return {
    id: 'byok', name: 'BYOK', available: () => !!apiKey,
    async complete(prompt) {
      const res = await fetch(url, {
        method: 'POST',
        headers: headers || { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      return (data.content && data.content[0] && data.content[0].text) || '';
    }
  };
}

let CURRENT = nullProvider();
export function setProvider(p) { CURRENT = p || nullProvider(); }
export function getProvider() { return CURRENT; }
