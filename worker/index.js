import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /api/stats - 记录背诵事件
    if (pathname === '/api/stats' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { text_key, correct_count, total_count, user_id } = body;

        if (!text_key || correct_count == null || total_count == null || !user_id) {
          return jsonResponse({ error: '缺少必填字段' }, 400);
        }

        await env.btw.prepare(
          'INSERT INTO recitation_events (user_id, text_key, correct_count, total_count) VALUES (?, ?, ?, ?)'
        )
          .bind(user_id, text_key, Number(correct_count), Number(total_count))
          .run();

        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // GET /api/stats/me?uid=xxx - 个人统计
    if (pathname === '/api/stats/me' && request.method === 'GET') {
      try {
        const uid = url.searchParams.get('uid');
        if (!uid) {
          return jsonResponse({ error: '缺少 uid 参数' }, 400);
        }

        const totalResult = await env.btw.prepare(
          'SELECT COUNT(*) as total_times, SUM(correct_count) as total_correct, SUM(total_count) as total_sentences FROM recitation_events WHERE user_id = ?'
        )
          .bind(uid)
          .first();

        const textsResult = await env.btw.prepare(
          'SELECT text_key, COUNT(*) as times, SUM(correct_count) as correct, SUM(total_count) as total FROM recitation_events WHERE user_id = ? GROUP BY text_key ORDER BY times DESC LIMIT 10'
        )
          .bind(uid)
          .all();

        return jsonResponse({
          total_times: totalResult?.total_times || 0,
          total_correct: totalResult?.total_correct || 0,
          total_sentences: totalResult?.total_sentences || 0,
          top_texts: textsResult?.results || [],
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // GET /api/stats - 全站统计
    if (pathname === '/api/stats' && request.method === 'GET') {
      try {
        const totalResult = await env.btw.prepare(
          'SELECT COUNT(*) as total_times, COUNT(DISTINCT user_id) as total_users FROM recitation_events'
        ).first();

        const topTexts = await env.btw.prepare(
          'SELECT text_key, COUNT(*) as times, AVG(correct_count * 100.0 / total_count) as avg_rate FROM recitation_events GROUP BY text_key ORDER BY times DESC LIMIT 10'
        ).all();

        return jsonResponse({
          total_times: totalResult?.total_times || 0,
          total_users: totalResult?.total_users || 0,
          top_texts: topTexts?.results || [],
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 非 API 路由返回 404
    if (pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'Not Found' }, 404);
    }

    // 非 API 请求交给静态资源处理
    try {
      // 处理根路径
      let assetPath = pathname;
      if (pathname === '/' || pathname === '') {
        assetPath = '/index.html';
      }

      const assetRequest = new Request(new URL(assetPath, url.origin));

      return await getAssetFromKV(
        {
          request: assetRequest,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
        }
      );
    } catch (e) {
      // 如果找不到资源，尝试返回 index.html（用于 SPA）
      try {
        const indexRequest = new Request(new URL('/index.html', url.origin));
        return await getAssetFromKV(
          {
            request: indexRequest,
            waitUntil: ctx.waitUntil.bind(ctx),
          },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
          }
        );
      } catch (e2) {
        return new Response('Not Found: ' + pathname, { status: 404 });
      }
    }
  },
};
