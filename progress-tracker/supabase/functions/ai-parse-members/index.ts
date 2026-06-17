// Supabase Edge Function: AI 解析部门人员分工表
// 前端上传文件后提取文本，发给此函数让 AI 识别部门与人员结构
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
        JSON.stringify({ departments: [], warning: "文件内容为空" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ departments: [], warning: "未配置 AI Key，无法解析" }),
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
              content: `你是一个组织架构分析助手。用户上传了一份部门人员分工安排表文本，请从中提取部门及人员信息。

返回一个 JSON 数组，每个元素格式：
{
  "department": "部门名称",
  "members": [
    { "name": "姓名", "role": "职位/角色", "skills": "技能标签（空格分隔）" }
  ]
}

规则：
1. 正确识别部门归属，同一部门的人员归到一起
2. 没有明确部门的，归入 department: "未分配部门"
3. 技能可从职务、备注中推断
4. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字`,
            },
            {
              role: "user",
              content: `请分析以下部门人员分工安排，提取部门和人员：\n\n${truncated}`,
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
        JSON.stringify({ departments: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 300)}`);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const departments = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({ departments }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (parseErr) {
        console.error(`JSON parse error: ${parseErr.message}`);
        return new Response(
          JSON.stringify({ departments: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 200) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ departments: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 200) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ departments: [], error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});