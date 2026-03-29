const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json({ limit: '100kb' }));

// Serve static files (index.html, style.css, game.js)
app.use(express.static(path.join(__dirname, 'public')));

// ============== NVIDIA NIM PROXY ==============
// Keeps the API key on the server side — never exposed to the browser.
// The frontend sends: { model, messages, max_tokens, temperature }
// The server attaches the API key and forwards to NVIDIA.

app.post('/api/chat', async (req, res) => {
    const { apiKey, model, messages, max_tokens, temperature } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('nvapi-')) {
        return res.status(400).json({ error: { message: 'Missing or invalid API key. It should start with nvapi-' } });
    }

    if (!model || typeof model !== 'string') {
        return res.status(400).json({ error: { message: 'Missing model parameter' } });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: { message: 'Missing or invalid messages array' } });
    }

    // Validate messages structure
    for (const msg of messages) {
        if (!msg.role || !msg.content || typeof msg.content !== 'string') {
            return res.status(400).json({ error: { message: 'Each message must have a role and content string' } });
        }
        if (!['system', 'user', 'assistant'].includes(msg.role)) {
            return res.status(400).json({ error: { message: `Invalid message role: ${msg.role}` } });
        }
    }

    const nvidiaUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';

    try {
        const response = await fetch(nvidiaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: Math.min(max_tokens || 800, 4096), // cap at 4096
                temperature: Math.min(Math.max(temperature || 0.8, 0), 2),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.error || { message: `NVIDIA API returned ${response.status}` }
            });
        }

        return res.json(data);
    } catch (err) {
        console.error('NVIDIA API proxy error:', err.message);
        return res.status(502).json({
            error: { message: 'Failed to connect to NVIDIA NIM API. Check your network or API key.' }
        });
    }
});

// ============== NVIDIA NIM MODEL LIST PROXY ==============
// Lets the frontend fetch available models from NVIDIA
app.get('/api/models', async (req, res) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || !apiKey.startsWith('nvapi-')) {
        return res.status(400).json({ error: { message: 'Provide your API key in the x-api-key header' } });
    }

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.error || { message: `NVIDIA API returned ${response.status}` }
            });
        }

        return res.json(data);
    } catch (err) {
        console.error('Model list fetch error:', err.message);
        return res.status(502).json({
            error: { message: 'Failed to fetch models from NVIDIA NIM API' }
        });
    }
});

// ============== START SERVER ==============
app.listen(PORT, () => {
    console.log(`\n🕵️  Murder Mystery Server running at http://localhost:${PORT}\n`);
});
