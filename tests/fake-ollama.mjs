// Test double for Ollama's /api/chat: records the system prompt and answers like a model would.
import http from 'node:http'; import fs from 'node:fs';
const LOG = process.env.FAKE_OLLAMA_LOG || '/tmp/fake-ollama.json';
http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    if (req.url === '/api/tags') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ models: [{ name: 'llama3.1' }] })); }
    const j = JSON.parse(b || '{}'); const sys = (j.messages || []).find(m => m.role === 'system')?.content || ''; const user = (j.messages || []).filter(m => m.role === 'user').pop()?.content || '';
    fs.writeFileSync(LOG, JSON.stringify({ system: sys, user }));
    const cc = /cc Ramin/i.test(sys);
    const content = /JSON object/.test(sys) ? JSON.stringify({ reply: `Following your rules${cc ? ' (cc Ramin)' : ''}.`, actions: [] }) : `Dear Sarah,\n\nConfirming Tuesday.${cc ? '\n\nCc: Ramin' : ''}\n\nKind regards`;
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: { role: 'assistant', content }, done: true }));
  });
}).listen(11555, () => console.log('fake ollama on 11555'));
