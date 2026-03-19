async function callClaude(prompt) {
  const response = await fetch(
    "https://ai-exam-companion-r3pi.onrender.com/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    }
  );

  const data = await response.json();

  if (data.error) {
    console.error("Server error:", data.error);
    return "Error: " + data.error;
  }

  return data.result;
}
