export const config = { runtime: 'edge' };

export default async function handler(req) {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  async function redis(cmd) {
    const r = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    return r.json();
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const app = body.app;
    const now = new Date().toISOString();
    
    if (!app) return new Response(JSON.stringify({ error: 'no app' }), { status: 400 });
    
    const stateKey = `state:${app}`;
    const { result: state } = await redis(['get', stateKey]);

    if (state === 'open') {
      const { result: start } = await redis(['get', `start:${app}`]);
      if (start) {
        const duration = Math.round((Date.now() - new Date(start)) / 60000);
        const logKey = `LOG${Date.now()}`;
        await redis(['set', logKey, `${app}|${start}|${now}|${duration}分钟`]);
        await redis(['expire', logKey, '86400']);
        await redis(['del', `start:${app}`]);
      }
      await redis(['set', stateKey, 'closed']);
    } else {
      await redis(['set', stateKey, 'open']);
      await redis(['set', `start:${app}`, now]);
    }

    return new Response(JSON.stringify({ ok: true, app }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // GET 查询记录
  const { result: keys } = await redis(['keys', 'LOG*']);
  const logs = [];
  if (keys && keys.length > 0) {
    for (const k of keys) {
      const { result: val } = await redis(['get', k]);
      if (val) {
      const parts = val.split('|');
logs.push({ 
  app: decodeURIComponent(parts[0]), 
  start: parts[1], 
  end: parts[2], 
  duration: parts[3] 
});
      }
    }
  }

  return new Response(JSON.stringify({ logs }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
