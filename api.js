async function callClaude(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 1024,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json();

  if (data.error) {
    console.error("Groq error:", data.error.message);
    return "Error: " + data.error.message;
  }

  return data.choices[0].message.content;
}