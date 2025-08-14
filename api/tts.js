const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ error: "use POST" });
  }

  const { text = "", voice = "alloy", format = "mp3" } = req.body || {};
  if (!process.env.OPENAI_API_KEY) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: "missing OPENAI_API_KEY" });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, format })
    });

    if (!r.ok) {
      const detail = await r.text();
      Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(500).json({ error: "openai_error", detail });
    }

    const ab = await r.arrayBuffer();
    const audioBase64 = Buffer.from(ab).toString("base64");
    const mimeType =
      format === "wav" ? "audio/wav" :
      format === "aac" ? "audio/aac" :
      format === "opus" ? "audio/opus" : "audio/mpeg";

    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({ audioBase64, mimeType });
  } catch (e) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
