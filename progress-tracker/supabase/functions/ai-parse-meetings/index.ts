// Supabase Edge Function: AI 解析会议任务表
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
        JSON.stringify({ meetings: [], warning: "文件内容为空" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ meetings: [], warning: "未配置 AI Key，无法解析" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const truncated = textContent.slice(0, 24000);

    console.log(`Calling DeepSeek API for meetings: ${finalApiUrl} with ${truncated.length} chars`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

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
              content: `你是一个会议任务分析助手。用户上传了一份会议任务表内容（来自Excel解析），请从中提取所有会议任务项。

输入格式说明：
- 表头列名通常为：序号、会议名称、会议时间、部门任务、责任人、状态
- 每行代表一个会议及其相关任务

返回一个 JSON 数组，每个元素格式：
{
  "meeting_name": "会议名称",
  "meeting_date": "会议时间（尽可能转换为YYYY-MM-DD格式，如为文本描述则保持原文）",
  "task_description": "部门任务描述",
  "assignee": "责任人姓名",
  "status": "状态（已完成/进行中/待开始）"
}

规则：
1. 识别表格中的所有会议条目
2. 如果会议时间是Excel数字（如46063），根据基准日期1900-01-01推算：46063 = 2026-02-14左右
3. 如果会议时间是文本描述（如"4月中旬"、"暂定6月中旬"），保持原文
4. 状态为空或无法确定时，默认为"待开始"
5. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
6. 如果内容中没有任何可识别的会议，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下会议任务表内容，提取所有会议任务：\n\n${truncated}`,
            },
          ],
          max_tokens: 8000,
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
        JSON.stringify({ meetings: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 500)}`);

    let meetings = null;

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { meetings = JSON.parse(jsonMatch[0]); } catch (_) {}
    }

    if (!meetings) {
      const objMatches = content.match(/\{[^{}]+\}/g);
      if (objMatches) {
        meetings = objMatches.map(s => {
          try { return JSON.parse(s); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }

    if (!meetings) {
      try {
        const m = content.match(/\[([\s\S]*)\]/);
        if (m) {
          const objs = (m[1].match(/\{[^{}]*\}/g) || []);
          meetings = objs.map(s => {
            try { return JSON.parse(s); } catch (_) { return null; }
          }).filter(Boolean);
        }
      } catch (_) {}
    }

    if (meetings && meetings.length > 0) {
      meetings = meetings.map(m => ({
        meeting_name: (m.meeting_name || "").trim(),
        meeting_date: m.meeting_date ? String(m.meeting_date).trim() : null,
        task_description: (m.task_description || "").trim(),
        assignee: (m.assignee || "").trim(),
        status: m.status || "pending",
      }));

      return new Response(
        JSON.stringify({ meetings }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ meetings: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ meetings: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
