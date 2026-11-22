async function generateRecommendation(req, res, next) {
  try {
    const apiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'LLM API key is not configured', code: 'LLM_NOT_CONFIGURED' });
    }

    const recommendation = req.body && req.body.recommendation;
    const userRequest = typeof req.body?.userRequest === 'string' ? req.body.userRequest.trim().slice(0, 500) : '';
    if (!recommendation || typeof recommendation !== 'object') {
      return res.status(400).json({ error: 'Recommendation data is required', code: 'INVALID_LLM_REQUEST' });
    }

    const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = process.env.LLM_MODEL || 'openai/gpt-oss-120b';

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            {
              role: 'system',
              content: 'You are a hotel offer comparison assistant. Use only the supplied JSON. When given a hotels array, explain the lowest-priced eligible hotel, its lowest supplier rate, and briefly compare the next options. Do not invent amenities, reviews, locations, or facts that are absent from the data. If a single-hotel supplier recommendation is provided instead, explain its cheapest eligible supplier and savings. Return a concise, helpful plain-text response.'
            },
            {
              role: 'user',
              content: `Guest request: ${userRequest || 'Find the best available hotel.'}\nExplain the best matching available hotel using only this data:\n${JSON.stringify(recommendation)}`
            }
          ]
        })
      });
    } catch (err) {
      console.error('LLM provider connection failed:', err);
      return res.status(502).json({ error: 'Could not connect to the LLM provider', code: 'LLM_CONNECTION_ERROR' });
    }

    if (!response.ok) {
      const details = await response.text();
      console.error('LLM request failed:', response.status, details);
      return res.status(502).json({ error: 'LLM provider request failed', code: 'LLM_PROVIDER_ERROR' });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return res.status(502).json({ error: 'LLM provider returned no response', code: 'LLM_EMPTY_RESPONSE' });
    }

    return res.json({ text });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateRecommendation };
