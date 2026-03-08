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
    const { taskTitle, projectContext, draftDescription } = await req.json();

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

    const systemPrompt = [
      '你是项目管理助手，负责把用户的任务草稿梳理、理顺和润色。',
      '要求：输出1-3句中文，60-160字，不要加引号。',
      '优先保留用户原文中的关键信息（名词、数字、约束、已有结论），不要凭空编造。',
      '在不改变原意前提下，补充更清晰的执行动作或产出物。',
      '避免空泛套话，语言简洁、自然、可执行。',
    ].join(' ');
    const contextLine = typeof projectContext === 'string' && projectContext.trim()
      ? `项目上下文：${projectContext.trim().slice(0, 240)}\n`
      : '';
    const draftLine = typeof draftDescription === 'string' && draftDescription.trim()
      ? `已有草稿：${draftDescription.trim().slice(0, 300)}\n请在其基础上补全优化。\n`
      : '';
    const userPrompt = `${contextLine}${draftLine}任务标题：${taskTitle.trim()}\n请基于已有信息做梳理和润色，让描述更清晰可执行。`;

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
        temperature: 0.1,
        max_tokens: 140,
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
    const description = raw.replace(/[\r\n]+/g, ' ').slice(0, 280).trim();

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
