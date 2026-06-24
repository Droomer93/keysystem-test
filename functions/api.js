export async function onRequest(context) {
    const { request, env } = context;

    const BIN = env.JSONBIN_ID;
    const KEY = env.JSONBIN_KEY;
    const PASSWORD = env.ADMIN_PASSWORD || 'admin123';

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const auth = request.headers.get('Authorization') || '';
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

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

    function json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        // GET /api?action=keys
        if (request.method === 'GET' && action === 'keys') {
            const keys = await getKeys();
            return json(keys);
        }

        // POST /api?action=generate
        if (request.method === 'POST' && action === 'generate') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);

            const count = body.count || 1;
            const type = body.type || 'lifetime';
            const product = body.product || '';
            const customDays = body.customDays || 0;

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
                const key = [seg(), seg(), seg(), seg()].join('-');
                const obj = { key, type, product, status: 'unused', created: new Date().toISOString(), expires: calcExpiry(), usedBy: null, usedAt: null, hwid: null };
                keys.push(obj);
                generated.push(obj);
            }
            await putKeys(keys);
            return json({ success: true, generated });
        }

        // POST /api?action=delete
        if (request.method === 'POST' && action === 'delete') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            let keys = await getKeys();
            keys = keys.filter(k => k.key !== body.key);
            await putKeys(keys);
            return json({ success: true });
        }

        // POST /api?action=reset
        if (request.method === 'POST' && action === 'reset') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            let keys = await getKeys();
            keys = keys.map(k => k.key === body.key ? { ...k, status: 'unused', usedBy: null, usedAt: null, hwid: null } : k);
            await putKeys(keys);
            return json({ success: true });
        }

        // POST /api?action=delete-all
        if (request.method === 'POST' && action === 'delete-all') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            await putKeys([]);
            return json({ success: true });
        }

        // GET /api?action=verify&key=XXX&hwid=YYY
        if (request.method === 'GET' && action === 'verify') {
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

        return json({ error: 'Unknown action' }, 404);
    } catch (e) {
        return json({ error: e.message }, 500);
    }
}
