export async function onRequest(context) {
    var request = context.request;
    var env = context.env;
    var BIN = env.JSONBIN_ID;
    var KEY = env.JSONBIN_KEY;
    var PASSWORD = env.ADMIN_PASSWORD || 'admin123';
    var url = new URL(request.url);
    var action = url.searchParams.get('action') || '';
    var auth = request.headers.get('Authorization') || '';

    var headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: headers });
    }

    async function getKeys() {
        var res = await fetch('https://api.jsonbin.io/v3/b/' + BIN + '/latest', {
            headers: { 'X-Master-Key': KEY }
        });
        var data = await res.json();
        return data.record?.keys || [];
    }

    async function putKeys(keys) {
        await fetch('https://api.jsonbin.io/v3/b/' + BIN, {
            method: 'PUT',
            headers: { 'X-Master-Key': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: keys })
        });
    }

    function json(data, status) {
        return new Response(JSON.stringify(data), {
            status: status || 200,
            headers: Object.assign({}, headers, { 'Content-Type': 'application/json' })
        });
    }

    try {
        var body = request.method === 'POST' ? await request.json().catch(function() { return {} }) : {};

        // GET /api?action=keys
        if (action === 'keys') {
            var keys = await getKeys();
            return json(keys);
        }

        // GET /api?action=test
        if (action === 'test') {
            return json({ status: 'ok', bin: BIN ? 'set' : 'missing', key: KEY ? 'set' : 'missing' });
        }

        // POST /api?action=generate
        if (action === 'generate') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);

            var count = body.count || 1;
            var type = body.type || 'lifetime';
            var product = body.product || '';
            var customDays = body.customDays || 0;

            function seg() {
                var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                var s = '';
                for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
                return s;
            }

            function calcExpiry() {
                if (type === 'lifetime') return null;
                var days = type === 'custom' ? customDays : (type === '30days' ? 30 : type === '90days' ? 90 : type === '365days' ? 365 : 30);
                return new Date(Date.now() + days * 86400000).toISOString();
            }

            var keys = await getKeys();
            var generated = [];
            for (var i = 0; i < count; i++) {
                var key = [seg(), seg(), seg(), seg()].join('-');
                var obj = { key: key, type: type, product: product, status: 'unused', created: new Date().toISOString(), expires: calcExpiry(), usedBy: null, usedAt: null, hwid: null };
                keys.push(obj);
                generated.push(obj);
            }
            await putKeys(keys);
            return json({ success: true, generated: generated });
        }

        // POST /api?action=delete
        if (action === 'delete') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            var keys = await getKeys();
            keys = keys.filter(function(k) { return k.key !== body.key });
            await putKeys(keys);
            return json({ success: true });
        }

        // POST /api?action=reset
        if (action === 'reset') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            var keys = await getKeys();
            keys = keys.map(function(k) {
                if (k.key === body.key) {
                    k.status = 'unused'; k.usedBy = null; k.usedAt = null; k.hwid = null;
                }
                return k;
            });
            await putKeys(keys);
            return json({ success: true });
        }

        // POST /api?action=delete-all
        if (action === 'delete-all') {
            if (auth !== PASSWORD) return json({ error: 'Wrong password' }, 403);
            await putKeys([]);
            return json({ success: true });
        }

        return json({ error: 'Unknown action: ' + action }, 404);
    } catch (e) {
        return json({ error: e.message }, 500);
    }
}
