// Supabase Edge Function: AI 解析目标表
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { textContent, apiUrl } = await req.json();

    if (!textContent || textContent.trim().length === 0) {
      return new Response(
        JSON.stringify({ goals: [], warning: "文件内容为空" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ goals: [], warning: "未配置 AI Key，无法解析" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const truncated = textContent.slice(0, 8000);

    console.log(`Calling DeepSeek API for goals: ${finalApiUrl} with ${truncated.length} chars`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(finalApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `你是一个组织目标分析助手。用户上传了一份年度工作目标/OKR/考核目标文档，请从中提取所有目标项。

返回一个 JSON 数组，每个元素格式：
{
  "title": "目标标题",
  "description": "目标描述或补充说明",
  "year": 年份数字,
  "quarter": "1|2|3|4|（可选，如无明确季度填null）"
}

规则：
1. 正确识别每个独立的目标条目
2. 如有明确的年份和季度注明，提取出来；没有则 year 填当前年份，quarter 填 null
3. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
4. 如果内容中没有任何可识别的目标，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下目标文档内容，提取所有目标：\n\n${truncated}`,
            },
          ],
          max_tokens: 4000,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error(`DeepSeek API error: ${response.status} ${errText}`);
      return new Response(
        JSON.stringify({ goals: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek goals response: ${content.slice(0, 500)}`);

    let goals = null;

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { goals = JSON.parse(jsonMatch[0]); } catch (_) {
        try {
          const cleaned = jsonMatch[0]
            .replace(/'/g, '"')
            .replace(/,\s*]/g, ']')
            .replace(/,\s*}/g, '}');
          goals = JSON.parse(cleaned);
        } catch (__) {}
      }
    }

    if (!goals) {
      const objMatches = content.match(/\{[\s\S]+?\}/g);
      if (objMatches) {
        goals = objMatches.map(s => { try { return JSON.parse(s); } catch (_) { return null; } }).filter(Boolean);
      }
    }

    if (goals && goals.length > 0) {
      return new Response(
        JSON.stringify({ goals }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ goals: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ goals: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});