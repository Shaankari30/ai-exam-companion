const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    }
  );

  const data = await response.json();

  if (data.error) {
    return res.status(500).json({ error: data.error.message });
  }

  res.json({ result: data.choices[0].message.content });
});

app.listen(3000, () => console.log("Server running on port 3000"));
