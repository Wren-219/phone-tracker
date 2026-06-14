export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const app = url.searchParams.get('app');
  const action = url.searchParams.get('action');
  
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  async function redis(cmd) {
    const r = await fetch(`${REDIS_URL}/${cmd.join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    return r.json();
  }
  
  if (app && action) {
    const now = new Date().toISOString();
    const key = `app:${app}`;
    
    if (action === 'open') {
      await redis(['set', key, now]);
    } else if (action === 'close') {
      const { result: start } = await redis(['get', key]);
      if (start) {
        const duration = Math.round((Date.now() - new Date(start)) / 60000);
        const logKey = `log:${Date.now()}`;
        await redis(['set', logKey, `${app}|${start}|${now}|${duration}分钟`]);
        await redis(['expire', logKey, '86400']);
        await redis(['del', key]);
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 查询今天的记录
  const { result: keys } = await redis(['keys', 'log:*']);
  const logs = [];
  if (keys && keys.length > 0) {
    for (const k of keys) {
      const { result: val } = await redis(['get', k]);
      if (val) {
        const [appName, start, end, duration] = val.split('|');
        logs.push({ app: appName, start, end, duration });
      }
    }
  }
  
  return new Response(JSON.stringify({ logs }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
