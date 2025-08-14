export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  const { audioBase64 = "", mimeType = "audio/webm" } = req.body || {};
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "missing OPENAI_API_KEY" });

  try {
    // support data URLs or raw base64
    const base64 = audioBase64.startsWith("data:")
      ? audioBase64.split(",")[1] || ""
      : audioBase64;

    const bytes = Buffer.from(base64, "base64");
    const blob = new Blob([bytes], { type: mimeType });
    const form = new FormData();
    const ext = mimeType.split("/")[1] || "webm";
    form.append("file", blob, `answer.${ext}`);
    form.append("model", "whisper-1");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    if (!r.ok) return res.status(500).json({ error: "openai_error", detail: await r.text() });

    const data = await r.json();
    res.status(200).json({ text: data.text || "" });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
