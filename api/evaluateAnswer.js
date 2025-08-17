// api/evaluateAnswer.js
// POST JSON: { question, answer, difficulty, resumeText?, jobText? }
// → { score: 0-10, decision: "pass"|"borderline"|"fail", reasons: string[], tips: string[] }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function rubricFor(difficulty = "Medium") {
  const base = {
    dimensions: ["Relevance", "Specificity", "Evidence", "Communication"],
    starExpected: true,
  };
  if (difficulty === "Easy") {
    return {
      ...base,
      thresholds: { pass: 7, borderline: 5 },
      guidance:
        "Be generous. Reward basic relevance and clear structure. Minor vagueness is acceptable. Short answers can still pass."
    };
  }
  if (difficulty === "Hard") {
    return {
      ...base,
      thresholds: { pass: 8, borderline: 6 },
      guidance:
        "Be strict. Demand concrete metrics, tools, timelines, and outcomes (STAR). Penalize vagueness and unsubstantiated claims."
    };
  }
  return {
    ...base,
    thresholds: { pass: 7.5, borderline: 6 },
    guidance:
      "Balanced. Expect STAR elements and at least 1–2 concrete details tied to the role; allow small gaps."
  };
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "missing OPENAI_API_KEY" });

  try {
    const { question = "", answer = "", difficulty = "Medium", resumeText = "", jobText = "" } = req.body || {};
    const rubric = rubricFor(String(difficulty));

    const system = {
      role: "system",
      content:
        "You are a strict but fair interview grader. Return ONLY valid JSON. " +
        'Schema: {"score": number(0-10), "decision":"pass|borderline|fail", "reasons": string[], "tips": string[]}. ' +
        "Score using the provided rubric and thresholds. Use whole numbers."
    };

    const user = {
      role: "user",
      content: [
        `RUBRIC DIFFICULTY: ${difficulty}`,
        `GUIDANCE: ${rubric.guidance}`,
        `DIMENSIONS: ${rubric.dimensions.join(", ")}`,
        "EXPECT STAR: " + rubric.starExpected,
        "",
        "QUESTION:",
        question,
        "",
        "ANSWER:",
        answer,
        "",
        "ROLE CONTEXT (optional):",
        `RESUME: ${String(resumeText).slice(0, 4000)}`,
        `JOB: ${String(jobText).slice(0, 4000)}`,
        "",
        "Instructions:",
        "- Score 0–10. Use higher standards for Hard, generous for Easy.",
        "- Decision rules:",
        `  if score >= ${rubric.thresholds.pass} → pass`,
        `  else if score >= ${rubric.thresholds.borderline} → borderline`,
        "  else → fail",
        "- Reasons: 2–4 brief bullets citing strengths/weaknesses vs dimensions.",
        "- Tips: 2–4 specific suggestions to improve the answer next time.",
        'Respond only as JSON, no backticks.'
      ].join("\n")
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [system, user]
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: "openai_error", detail });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      // Simple fallback parse
      parsed = { score: 0, decision: "fail", reasons: ["Could not parse response"], tips: ["Try again"] };
    }

    // Clamp score and backfill fields
    const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score || 0))));
    const decision = ["pass", "borderline", "fail"].includes((parsed.decision || "").toLowerCase())
      ? parsed.decision.toLowerCase()
      : (score >= rubric.thresholds.pass ? "pass" : (score >= rubric.thresholds.borderline ? "borderline" : "fail"));

    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 4) : [];
    const tips = Array.isArray(parsed.tips) ? parsed.tips.slice(0, 4) : [];

    return res.status(200).json({ score, decision, reasons, tips });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
