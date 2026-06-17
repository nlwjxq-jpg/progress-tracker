// Supabase Edge Function: AI 解析任务表
// 前端上传文件后提取文本，发给此函数让 AI 结构化输出任务列表
// 去重和写入由前端完成，AI 只负责解析
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { textContent, apiUrl } = await req.json();

    if (!textContent || textContent.trim().length === 0) {
      return new Response(
        JSON.stringify({ tasks: [], warning: "文件内容为空" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ tasks: [], warning: "未配置 AI Key，无法解析" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const truncated = textContent.slice(0, 8000);

    console.log(`Calling DeepSeek API: ${finalApiUrl} with ${truncated.length} chars`);

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
              content: `你是一个工作任务分析助手。用户上传了一份年度/季度工作任务表文本，请从中提取所有任务项。

返回一个 JSON 数组，每个元素格式：
{
  "title": "任务名称",
  "description": "任务描述或补充说明",
  "due_date": "截止日期（YYYY-MM-DD格式，如无明确日期则填null）",
  "priority": "low|normal|high|urgent（根据任务紧急程度判断，默认normal）"
}

规则：
1. 识别表格、列表、段落中的所有独立任务
2. 同类子任务应拆分为独立条目
3. 没有明确截止日期的，due_date 填 null
4. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
5. 如果内容中没有任何可识别的任务，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下工作任务表内容，提取所有任务：\n\n${truncated}`,
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
        JSON.stringify({ tasks: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 300)}`);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const tasks = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({ tasks }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (parseErr) {
        console.error(`JSON parse error: ${parseErr.message}`);
        return new Response(
          JSON.stringify({ tasks: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 200) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ tasks: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 200) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ tasks: [], error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});