// Cloudflare Pages Function - handles /api/* routes
// This code is NEVER exposed to users

const BIN_ID = '6a3baddcda38895dfef6a061';
const API_KEY = '$2a$10$N2MQ5tq11xAnfuAvBL87J.I3EkzmqD4Cci3wR3cg6BsfmI7/K0q9C';

// You can also use Cloudflare KV instead of JSONbin (free tier included)
// Then you don't need JSONbin at all

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequest(context) {
    const { request, env } = context;
    
    // Use env vars (set in Cloudflare Dashboard > Pages > Settings > Environment variables)
    const PASSWORD = env.ADMIN_PASSWORD || 'admin123';
    const BIN = env.JSONBIN_ID || BIN_ID;
    const KEY = env.JSONBIN_KEY || API_KEY;

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace('/api', '');
    const auth = request.headers.get('Authorization') || '';
    const body = request.method !== 'GET' ? await request.json().catch(() => ({})) : {};

    // Auth check for writes
    const needsAuth = ['/generate', '/delete', '/reset', '/delete-all'];
    if (needsAuth.includes(path) && auth !== PASSWORD) {
        return json({ error: 'Wrong password' }, 403);
    }

    try {
        // ===== FETCH KEYS FROM JSONBIN =====
        async function getKeys() {
            const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN}/latest`, {
                headers: { 'X-Master-Key': KEY }
            });
            const data = await res.json();
            return data.record?.keys || [];
        }

        async function putKeys(keys) {
            await fetch(`https://api.jsonbin.io/v3/b/${BIN}`, {
                method: 'PUT',
                headers: { 'X-Master-Key': KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys })
            });
        }

        // ===== ROUTES =====
        switch (path) {
            case '/keys': {
                const keys = await getKeys();
                return json(keys);
            }

            case '/generate': {
                const count = body.count || 1;
                const type = body.type || 'lifetime';
                const product = body.product || '';
                const customDays = body.customDays || 0;
                const prefix = body.prefix || '';

                function seg() {
                    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let s = '';
                    for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
                    return s;
                }

                function calcExpiry() {
                    const d = { '30days': 30, '90days': 90, '365days': 365 };
                    if (type === 'lifetime') return null;
                    if (type === 'custom') return new Date(Date.now() + customDays * 86400000).toISOString();
                    return new Date(Date.now() + (d[type] || 30) * 86400000).toISOString();
                }

                const keys = await getKeys();
                const generated = [];
                for (let i = 0; i < count; i++) {
                    const key = prefix + [seg(), seg(), seg(), seg()].join('-');
                    const obj = { key, type, product, status: 'unused', created: new Date().toISOString(), expires: calcExpiry(), usedBy: null, usedAt: null, hwid: null };
                    keys.push(obj);
                    generated.push(obj);
                }
                await putKeys(keys);
                return json({ success: true, generated });
            }

            case '/delete': {
                let keys = await getKeys();
                keys = keys.filter(k => k.key !== body.key);
                await putKeys(keys);
                return json({ success: true });
            }

            case '/reset': {
                let keys = await getKeys();
                keys = keys.map(k => k.key === body.key ? { ...k, status: 'unused', usedBy: null, usedAt: null, hwid: null } : k);
                await putKeys(keys);
                return json({ success: true });
            }

            case '/delete-all': {
                await putKeys([]);
                return json({ success: true });
            }

            case '/verify': {
                const key = url.searchParams.get('key');
                const hwid = url.searchParams.get('hwid') || 'unknown';
                const keys = await getKeys();
                const kd = keys.find(k => k.key === key);

                if (!kd) return json({ valid: false, message: 'Invalid key' });
                if (kd.expires && new Date(kd.expires) < new Date()) {
                    kd.status = 'expired';
                    await putKeys(keys);
                    return json({ valid: false, message: 'Expired' });
                }
                if (kd.status === 'active' && kd.hwid && kd.hwid !== hwid) {
                    return json({ valid: false, message: 'Already used' });
                }
                if (kd.status === 'unused') {
                    kd.status = 'active';
                    kd.usedAt = new Date().toISOString();
                    kd.usedBy = hwid;
                    kd.hwid = hwid;
                    await putKeys(keys);
                }
                return json({ valid: true, type: kd.type, expires: kd.expires, product: kd.product });
            }

            default:
                return json({ error: 'Not found' }, 404);
        }
    } catch (e) {
        return json({ error: e.message }, 500);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
