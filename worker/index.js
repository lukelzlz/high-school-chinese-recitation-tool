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

// 初始化数据库表
async function ensureTableExists(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS recitation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        text_key TEXT NOT NULL,
        correct_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_id ON recitation_events(user_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_text_key ON recitation_events(text_key)`),
  ]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /api/recognize - 手写文字识别
    if (pathname === '/api/recognize' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { image } = body;

        if (!image || !image.startsWith('data:image/')) {
          return jsonResponse({ error: '无效的图片数据' }, 400);
        }

        if (image.length > 2 * 1024 * 1024) {
          return jsonResponse({ error: '图片过大，请减少书写内容' }, 400);
        }

        if (!env.AI) {
          return jsonResponse({ error: '识别服务未配置' }, 503);
        }

        const model = '@cf/moonshotai/kimi-k2.5';

        const response = await env.AI.run(model, {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '你是一个OCR识别工具。请识别图片中手写的中文文字。规则：1.只输出识别到的文字本身，不要任何解释、描述、翻译或注释。2.不要输出英文。3.不要输出标点符号和空格。4.如果图片中没有文字，只输出一个空字符串。5.直接输出原始文字，不要加引号。',
                },
                {
                  type: 'image_url',
                  image_url: { url: image },
                },
              ],
            },
          ],
          max_tokens: 100,
        });

        const text = response?.response?.trim() || '';
        return jsonResponse({ text });
      } catch (err) {
        console.error('Recognition error:', err);
        return jsonResponse({ error: '识别服务出错: ' + (err.message || err) }, 500);
      }
    }

    // POST /api/stats - 记录背诵事件
    if (pathname === '/api/stats' && request.method === 'POST') {
      try {
        // 确保表存在
        await ensureTableExists(env.btw);

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
        // 确保表存在
        await ensureTableExists(env.btw);

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
        // 确保表存在
        await ensureTableExists(env.btw);

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

    // 静态资源处理 - 使用新的 Assets binding
    try {
      // 处理根路径
      let assetPath = pathname;
      if (assetPath === '/' || assetPath === '') {
        assetPath = '/index.html';
      }

      return env.ASSETS.fetch(new Request(new URL(assetPath, url.origin)));
    } catch (e) {
      // Fallback 到 index.html
      try {
        return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
      } catch (e2) {
        return new Response('Not Found', { status: 404 });
      }
    }
  },
};
