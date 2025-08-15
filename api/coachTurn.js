// api/coachTurn.js
// Conversational turn: generates the coach's next utterance (ack + follow-up) and returns speech audio.
// Inputs (POST JSON):
// {
//   resumeText: string,
//   jobText: string,
//   conversation: [{ role: "assistant"|"user", content: string }],
//   userAnswer?: string,       // latest answer (optional when start=true)
//   start?: boolean,           // true to start conversation (no userAnswer)
//   maxTurns?: number          // stop after this many assistant turns (default 8)
// }
// Output: { text, audioBase64, mimeType, done, turnNo }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

async function openaiChat(messages) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.5
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

async function tts(text, voice = "alloy", format = "mp3") {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, format })
  });
  if (!r.ok) throw new Error(await r.text());
  const ab = await r.arrayBuffer();
  const audioBase64 = Buffer.from(ab).toString("base64");
  const mimeType =
    format === "wav" ? "audio/wav" :
    format === "aac" ? "audio/aac" :
    format === "opus" ? "audio/opus" : "audio/mpeg";
  return { audioBase64, mimeType };
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "missing OPENAI_API_KEY" });

  try {
    const {
      resumeText = "",
      jobText = "",
      conversation = [],
      userAnswer = "",
      start = false,
      maxTurns = 8,
      voice = "alloy"
    } = req.body || {};

    // Count assistant turns so far
    const assistantTurns = conversation.filter(m => m.role === "assistant").length;
    const nextTurnNo = assistantTurns + 1;
    const done = nextTurnNo > Number(maxTurns || 8);

    // Build system instructions for conversational style
    const system = {
      role: "system",
      content: [
        "You are a warm, concise interview coach.",
        "Goal: make this feel like a natural conversation.",
        "For each turn: (1) briefly acknowledge the candidate’s last point,",
        "(2) ask a targeted follow-up OR a new question, one sentence.",
        "Keep replies 1–2 sentences max. Avoid lists or numbering.",
        "Favor behavioral prompts ('Tell me about a time…') tied to the job and resume.",
        "Stop when you receive the signal 'END' or maxTurns is hit."
      ].join(" ")
    };

    // Context message with job + resume
    const context = {
      role: "user",
      content:
        `Context for interview:\n` +
        `RESUME:\n${String(resumeText).slice(0,6000)}\n\n` +
        `JOB:\n${String(jobText).slice(0,6000)}`
    };

    // Start or continue
    let messages = [system, context, ...conversation];

    if (start) {
      messages.push({
        role: "user",
        content:
          "Start the conversation with a friendly greeting (one short sentence) and your first question (one sentence)."
      });
    } else if (userAnswer) {
      messages.push({
        role: "user",
        content:
          `Candidate answer: """${userAnswer}"""\n` +
          `Respond concisely: a 1-sentence acknowledgment + a 1-sentence follow-up.`
      });
    }

    // If we've hit maxTurns, end with a closing line
    if (done) {
      messages.push({
        role: "user",
        content: "We reached max turns. Say one warm closing sentence and stop."
      });
    }

    // Get coach text and convert to speech
    const text = await openaiChat(messages);
    const { audioBase64, mimeType } = await tts(text, voice, "mp3");

    res.status(200).json({ text, audioBase64, mimeType, done, turnNo: nextTurnNo });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
