export const config = { runtime: 'edge' };

export default async function handler(req) {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  async function redis(cmd) {
  const [command, ...args] = cmd;
  const encodedArgs = args.map((a, i) =>
    command === 'set' && i === 1 ? a : encodeURIComponent(String(a))
  );
  const r = await fetch(`${REDIS_URL}/${command}/${encodedArgs.join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  return r.json();
}

  if (req.method === 'POST') {
    const body = await req.json();
    const app = body.app;
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    if (!app) return new Response(JSON.stringify({ error: 'no app' }), { status: 400 });

    const stateKey = `state_${app}`;
    const startKey = `start_${app}`;
    const { result: state } = await redis(['get', stateKey]);

    if (state === 'open') {
      const { result: startStr } = await redis(['get', startKey]);
      if (startStr) {
        const startTime = parseInt(startStr);
        const duration = Math.round((now - startTime) / 60000);
        const logKey = `LOG${now}`;
        const logVal = JSON.stringify({ app, start: new Date(startTime).toISOString(), end: nowISO, duration });
        await redis(['set', logKey, logVal]);
        await redis(['expire', logKey, '86400']);
        await redis(['del', startKey]);
      }
      await redis(['set', stateKey, 'closed']);
    } else {
      await redis(['set', stateKey, 'open']);
      await redis(['set', startKey, String(now)]);
    }

    return new Response(JSON.stringify({ ok: true, app }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const { result: keys } = await redis(['keys', 'LOG*']);
  const logs = [];
  if (keys && keys.length > 0) {
    for (const k of keys) {
      const { result: val } = await redis(['get', k]);
      if (val) {
        try { logs.push(JSON.parse(decodeURIComponent(val))); } catch {}
      }
    }
  }
  logs.sort((a, b) => new Date(b.start) - new Date(a.start));

  return new Response(JSON.stringify({ logs }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
