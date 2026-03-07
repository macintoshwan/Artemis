import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DashScopeMessage {
  content?: string;
}

interface DashScopeChoice {
  message?: DashScopeMessage;
}

interface DashScopeResponse {
  choices?: DashScopeChoice[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { taskTitle } = await req.json();

    if (typeof taskTitle !== 'string' || !taskTitle.trim()) {
      return new Response(JSON.stringify({ error: 'taskTitle is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('DASHSCOPE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing DASHSCOPE_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = Deno.env.get('QWEN_MODEL') || 'qwen-turbo';

    const systemPrompt = '你是项目管理助手。仅输出一句中文任务描述，不超过32个字，不要加引号。';
    const userPrompt = `任务标题：${taskTitle.trim()}\n请给出一句可执行的任务描述。`;

    const aiResp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 64,
      }),
    });

    if (!aiResp.ok) {
      const detail = await aiResp.text();
      return new Response(JSON.stringify({ error: 'Qwen API request failed', detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiResp.json() as DashScopeResponse;
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
    const description = raw.replace(/[\r\n]+/g, ' ').slice(0, 120).trim();

    if (!description) {
      return new Response(JSON.stringify({ error: 'Empty model output' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
