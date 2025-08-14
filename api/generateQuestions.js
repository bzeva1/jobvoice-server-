// Works with GET (query string) or POST (JSON). Easy to test in the browser.
export default async function handler(req, res) {
  // --- read input ---
  let resumeText = "", jobText = "", count = 5;

  // GET via query string
  try {
    const url = new URL(req.url, "http://localhost");
    resumeText = url.searchParams.get("resumeText") ?? "";
    jobText    = url.searchParams.get("jobText") ?? "";
    count      = parseInt(url.searchParams.get("count") ?? "5", 10);
  } catch {}

  // POST via JSON body
  if (req.method === "POST") {
    let raw = "";
    await new Promise(r => (req.on("data", c => raw += c), req.on("end", r)));
    try {
      const body = JSON.parse(raw || "{}");
      if (body.resumeText) resumeText = body.resumeText;
      if (body.jobText)    jobText    = body.jobText;
      if (body.count)      count      = parseInt(body.count, 10);
    } catch {}
  }

  const n = Math.max(1, Math.min(12, Number.isFinite(count) ? count : 5));

  const messages = [
    { role: "system",
      content: 'You are an expert interviewer. Reply ONLY with valid JSON: {"questions":["..."]}.' },
    { role: "user",
      content: `Create ${n} concise interview questions from:\nRESUME:\n${String(resumeText).slice(0,6000)}\n\nJOB:\n${String(jobText).slice(0,6000)}` }
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.4 })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "openai_error", detail: err });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";

    // parse JSON first, then fallback to lines
    let questions = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.questions)) questions = parsed.questions;
    } catch {
      questions = raw.split(/\r?\n/)
        .map(s => s.replace(/^\s*[-*•\d\)\.]+\s*/, "").trim())
        .filter(Boolean);
    }

    if (!questions.length) {
      questions = [
        "Walk me through your most relevant experience for this role.",
        "Tell me about a time you solved a difficult problem.",
        "How have you used the tools in the job description?",
        "Describe a process you improved.",
        "Why this company and role?"
      ].slice(0, n);
    }

    res.status(200).json({ questions: questions.slice(0, n) });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
