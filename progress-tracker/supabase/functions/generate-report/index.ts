import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://uovrvtbyckdtnonvdrpx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvdnJ2dGJ5Y2tkdG5vbnZkcnB4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA5ODYxMSwiZXhwIjoyMDk2Njc0NjExfQ.60SYUSHWIPq2V7Jl5k-CweEin-820I5zWAUm4TZIs_4";

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const body = await req.json();
    const { tasks, month, apiUrl } = body;

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: "无任务数据" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const monthLabel = month === "last" ? "上月" : "当月";
    
    // Build task summary for AI
    const keyTasks = tasks.filter(t => t.is_key);
    const dailyTasks = tasks.filter(t => !t.is_key);
    
    let taskSummary = `## ${monthLabel}工作任务汇总\n\n`;
    
    if (keyTasks.length > 0) {
      taskSummary += "### 重点任务\n\n";
      keyTasks.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title}\n`;
        taskSummary += `   进度: ${t.progress}% | 状态: ${t.status}\n`;
        if (month === "last" && t.last_month_progress) taskSummary += `   上月进展: ${t.last_month_progress}\n`;
        if (month === "last" && t.last_month_target) taskSummary += `   上月目标: ${t.last_month_target}\n`;
        if (month === "current" && t.this_month_target) taskSummary += `   本月目标: ${t.this_month_target}\n`;
        if (month === "current" && t.last_month_progress) taskSummary += `   上月进展: ${t.last_month_progress}\n`;
        taskSummary += "\n";
      });
    }
    
    if (dailyTasks.length > 0) {
      taskSummary += "### 日常任务\n\n";
      dailyTasks.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title} | 进度: ${t.progress}% | 状态: ${t.status}\n`;
        if (month === "last" && t.last_month_progress) taskSummary += `   进展: ${t.last_month_progress}\n`;
        if (month === "current" && t.this_month_target) taskSummary += `   目标: ${t.this_month_target}\n`;
        taskSummary += "\n";
      });
    }

    // Call AI to generate report
    const aiResp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `你是一名专业的机关单位文秘人员。请根据提供的${monthLabel}工作任务数据，撰写一份正式的工作月报。

要求：
1. 采用公文格式，语言正式、条理清晰、表达准确
2. 标题为"${monthLabel}工作月报"，居中
3. 分段结构：一、重点工作进展 / 二、日常工作完成情况 / 三、存在问题与困难 / 四、下步工作计划
4. 各段小标题对仗工整
5. 每项任务用一句话概括进展，避免罗列
6. 文中不要出现星号(*)标记
7. 结尾标注报告生成日期`
          },
          {
            role: "user",
            content: taskSummary
          }
        ],
        temperature: 0.7,
        max_tokens: 3000
      })
    });

    const aiData = await aiResp.json();
    if (!aiResp.ok) throw new Error(aiData.error?.message || "AI调用失败");

    const report = aiData.choices?.[0]?.message?.content || "报告生成失败，请重试";

    return new Response(JSON.stringify({ report }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
