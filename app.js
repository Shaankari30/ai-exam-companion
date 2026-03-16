// ============================================
// STATE — stores everything about the session
// ============================================
const STATE = {
  topics: [],
  currentQuestion: null,
  questionCount: 0,
  correctCount: 0,
  topicScores: {},
  difficulty: "medium",
  syllabus: ""
};

// ============================================
// PDF UPLOAD
// ============================================
document.getElementById("analyse-btn").addEventListener("click", async () => {
  const fileInput = document.getElementById("pdf-upload");
  const examDate = document.getElementById("exam-date").value;

  if (!fileInput.files[0]) {
    alert("Please select a PDF file first.");
    return;
  }

  document.getElementById("plan-result").innerHTML = '<span class="loading">Reading your syllabus...</span>';
  document.getElementById("question-text").innerHTML = '<span class="loading">Generating your first question...</span>';

  const file = fileInput.files[0];
  const text = await extractTextFromPDF(file);
  STATE.syllabus = text;

  await analyseSyllabus(text, examDate);
});

async function extractTextFromPDF(file) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(" ") + "\n";
  }
  return fullText;
}

// ============================================
// ANALYSE SYLLABUS WITH AI
// ============================================
async function analyseSyllabus(text, examDate) {
  const prompt = `You are an expert study coach. Analyse this syllabus and extract exactly 8 main topics.

Syllabus:
${text.substring(0, 3000)}

Return ONLY a JSON array like this — no other text, no markdown, just the raw JSON:
[
  {"id": 1, "name": "Topic Name", "chapter": "Chapter 1", "difficulty": "hard"},
  {"id": 2, "name": "Topic Name", "chapter": "Chapter 2", "difficulty": "medium"}
]

Extract exactly 8 topics. Keep names short (2-4 words max).`;

  const response = await callClaude(prompt);

  try {
    const cleaned = response.replace(/```json|```/g, "").trim();
    STATE.topics = JSON.parse(cleaned);
    STATE.topics.forEach(t => {
      STATE.topicScores[t.id] = { correct: 0, total: 0 };
    });
    drawKnowledgeGraph();
    await generateStudyPlan(examDate);
    await generateQuestion();
  } catch (e) {
    document.getElementById("plan-result").textContent = "Error reading syllabus. Please try a different PDF.";
    console.error("Parse error:", e, response);
  }
}

// ============================================
// KNOWLEDGE GRAPH (D3.js)
// ============================================
function drawKnowledgeGraph() {
  const container = document.getElementById("graph-container");
  const width = container.offsetWidth;
  const height = container.offsetHeight;

  d3.select("#graph-container").selectAll("*").remove();

  const svg = d3.select("#graph-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  // Draw connecting lines from center to each node
  STATE.topics.forEach((topic, i) => {
    const angle = (i / STATE.topics.length) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    svg.append("line")
      .attr("x1", centerX).attr("y1", centerY)
      .attr("x2", x).attr("y2", y)
      .attr("stroke", "#2a2a3a")
      .attr("stroke-width", 1.5);
  });

  // Center node
  svg.append("circle")
    .attr("cx", centerX).attr("cy", centerY)
    .attr("r", 28)
    .attr("fill", "#7c6ff7");

  svg.append("text")
    .attr("x", centerX).attr("y", centerY)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("fill", "white")
    .attr("font-size", "11px")
    .attr("font-weight", "600")
    .text("SYLLABUS");

  // Topic nodes
  STATE.topics.forEach((topic, i) => {
    const angle = (i / STATE.topics.length) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const g = svg.append("g")
      .attr("id", `node-${topic.id}`)
      .style("cursor", "pointer");

    g.append("circle")
      .attr("cx", x).attr("cy", y)
      .attr("r", 36)
      .attr("fill", "#e05555")
      .attr("stroke", "#2a2a3a")
      .attr("stroke-width", 2);

    const words = topic.name.split(" ");
    if (words.length <= 2) {
      g.append("text")
        .attr("x", x).attr("y", y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "white")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .text(topic.name);
    } else {
      g.append("text")
        .attr("x", x).attr("y", y - 7)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .text(words.slice(0, 2).join(" "));
      g.append("text")
        .attr("x", x).attr("y", y + 7)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "10px")
        .text(words.slice(2).join(" "));
    }
  });
}

function updateNodeColor(topicId) {
  const score = STATE.topicScores[topicId];
  if (!score || score.total === 0) return;

  const pct = score.correct / score.total;
  let color = "#e05555";
  if (pct >= 0.7) color = "#1db954";
  else if (pct >= 0.4) color = "#f0a500";

  d3.select(`#node-${topicId}`).select("circle")
    .transition().duration(600)
    .attr("fill", color);
}

// ============================================
// STUDY PLAN
// ============================================
async function generateStudyPlan(examDate) {
  let daysLeft = 7;
  if (examDate) {
    const today = new Date();
    const exam = new Date(examDate);
    daysLeft = Math.max(1, Math.ceil((exam - today) / (1000 * 60 * 60 * 24)));
  }

  const prompt = `You are a study coach. Create a day-by-day study plan.

Topics: ${STATE.topics.map(t => t.name).join(", ")}
Days until exam: ${daysLeft}

Write a short, clear plan. Format it exactly like this:
Day 1: [topic names]
Day 2: [topic names]
...

Maximum ${Math.min(daysLeft, 7)} days. Last day should be "Review + Practice Papers". Keep it concise.`;

  const plan = await callClaude(prompt);
  document.getElementById("plan-result").textContent = plan;
}

// ============================================
// QUIZ ENGINE
// ============================================
async function generateQuestion() {
  const topic = STATE.topics[STATE.questionCount % STATE.topics.length];
  const difficultyNote = STATE.difficulty === "easy"
    ? "Ask a very simple basic question."
    : STATE.difficulty === "hard"
    ? "Ask a challenging application question."
    : "Ask a moderate question.";

  const prompt = `You are a university exam question generator.
Topic: ${topic.name}
Context: ${STATE.syllabus.substring(0, 1000)}

${difficultyNote}

Write ONE clear exam question. Just the question, nothing else. No numbering, no "Question:", just the question itself.`;

  const question = await callClaude(prompt);
  STATE.currentQuestion = { question, topicId: topic.id, topicName: topic.name };
  document.getElementById("question-text").textContent = question;
  document.getElementById("answer-input").value = "";
  document.getElementById("feedback-box").textContent = "";
  document.getElementById("feedback-box").className = "";
}

document.getElementById("submit-btn").addEventListener("click", async () => {
  const answer = document.getElementById("answer-input").value.trim();
  if (!answer) { alert("Please type an answer first."); return; }
  if (!STATE.currentQuestion) { alert("Please upload a syllabus first."); return; }

  document.getElementById("feedback-box").innerHTML = '<span class="loading">Evaluating...</span>';

  const prompt = `You are an exam evaluator.
Question: ${STATE.currentQuestion.question}
Student's answer: ${answer}

Is this answer correct or partially correct?
Reply in this exact format:
RESULT: correct   (or "wrong")
FEEDBACK: [one sentence explaining why, and the correct answer if wrong]`;

  const evaluation = await callClaude(prompt);
  const isCorrect = evaluation.toLowerCase().includes("result: correct");
  const feedbackMatch = evaluation.match(/FEEDBACK:\s*(.+)/i);
  const feedbackText = feedbackMatch ? feedbackMatch[1] : evaluation;

  STATE.questionCount++;
  STATE.topicScores[STATE.currentQuestion.topicId].total++;

  if (isCorrect) {
    STATE.correctCount++;
    STATE.topicScores[STATE.currentQuestion.topicId].correct++;
    document.getElementById("feedback-box").className = "correct";
    document.getElementById("feedback-box").textContent = "✓ Correct! " + feedbackText;

    const topicScore = STATE.topicScores[STATE.currentQuestion.topicId];
    if (topicScore.correct >= 3) STATE.difficulty = "hard";

  } else {
    document.getElementById("feedback-box").className = "wrong";
    document.getElementById("feedback-box").textContent = "✗ " + feedbackText;
    STATE.difficulty = "easy";
  }

  updateNodeColor(STATE.currentQuestion.topicId);

  if (STATE.questionCount === 10) updateExamPredictor();

  setTimeout(() => generateQuestion(), 2000);
});

// ============================================
// EXAM PREDICTOR
// ============================================
function updateExamPredictor() {
  const scores = STATE.topics.map(t => {
    const s = STATE.topicScores[t.id];
    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    return { name: t.name, pct };
  });

  const avg = Math.round(scores.reduce((a, b) => a + b.pct, 0) / scores.length);
  const predicted = Math.round(avg * 0.85);
  const weak = scores.filter(s => s.pct < 50).map(s => s.name);

  let html = `<div class="score-badge ${predicted >= 70 ? "high" : predicted >= 50 ? "mid" : "low"}">${predicted}%</div>`;
  html += `<div style="font-size:12px;color:#aaa;margin-top:8px">Predicted exam score based on your quiz performance.</div>`;

  if (weak.length > 0) {
    html += `<div style="font-size:12px;color:#e05555;margin-top:8px">⚠ Revise: ${weak.join(", ")}</div>`;
  } else {
    html += `<div style="font-size:12px;color:#1db954;margin-top:8px">✓ Strong across all topics!</div>`;
  }

  document.getElementById("prediction-result").innerHTML = html;
}

// ============================================
// VOICE QUIZ
// ============================================
document.getElementById("mic-btn").addEventListener("click", () => {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    alert("Voice input only works in Chrome. Please use Chrome.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;

  const btn = document.getElementById("mic-btn");
  btn.classList.add("listening");
  btn.textContent = "🎤 Listening...";

  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("answer-input").value = transcript;
    btn.classList.remove("listening");
    btn.textContent = "🎤 Speak Answer";
  };

  recognition.onerror = () => {
    btn.classList.remove("listening");
    btn.textContent = "🎤 Speak Answer";
    alert("Microphone error. Make sure you clicked Allow when Chrome asked for permission.");
  };

  recognition.onend = () => {
    btn.classList.remove("listening");
    btn.textContent = "🎤 Speak Answer";
  };
});

// ============================================
// EXPORT STUDY REPORT
// ============================================
document.getElementById("export-btn").addEventListener("click", () => {
  const scores = STATE.topics.map(t => {
    const s = STATE.topicScores[t.id];
    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    return { name: t.name, pct };
  });

  const reportDiv = document.createElement("div");
  reportDiv.style.cssText = `
    position:fixed; top:-9999px; left:-9999px;
    width:600px; background:#16181f; color:#e0e0e0;
    padding:40px; font-family:Segoe UI,sans-serif; border-radius:16px;
  `;

  const avg = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b.pct, 0) / scores.length)
    : 0;

  reportDiv.innerHTML = `
    <h2 style="color:#7c6ff7;margin-bottom:6px">AI Exam Companion</h2>
    <p style="color:#888;margin-bottom:24px;font-size:13px">Study Session Report — ${new Date().toLocaleDateString()}</p>
    <div style="font-size:36px;font-weight:700;color:${avg>=70?"#1db954":avg>=50?"#f0a500":"#e05555"};margin-bottom:20px">${avg}% Mastery</div>
    <div style="margin-bottom:20px">
      ${scores.map(s => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3a;font-size:13px">
          <span>${s.name}</span>
          <span style="color:${s.pct>=70?"#1db954":s.pct>=40?"#f0a500":"#e05555"};font-weight:600">${s.pct}%</span>
        </div>
      `).join("")}
    </div>
    <p style="color:#888;font-size:11px">Generated by AI Exam Companion</p>
  `;

  document.body.appendChild(reportDiv);

  html2canvas(reportDiv, { backgroundColor: "#16181f" }).then(canvas => {
    const link = document.createElement("a");
    link.download = "study-report.png";
    link.href = canvas.toDataURL();
    link.click();
    document.body.removeChild(reportDiv);
  });
});

// ============================================
// JAKE'S DEMO MODE
// ============================================
document.getElementById("demo-btn").addEventListener("click", async () => {
  if (!confirm("Run Jake's demo? This will replace current session data.")) return;

  // Pre-built Jake's story data
  STATE.topics = [
    { id: 1, name: "Variables", chapter: "Chapter 1", difficulty: "easy" },
    { id: 2, name: "Loops", chapter: "Chapter 2", difficulty: "medium" },
    { id: 3, name: "Functions", chapter: "Chapter 3", difficulty: "medium" },
    { id: 4, name: "Arrays", chapter: "Chapter 4", difficulty: "medium" },
    { id: 5, name: "OOP Basics", chapter: "Chapter 5", difficulty: "hard" },
    { id: 6, name: "Recursion", chapter: "Chapter 6", difficulty: "hard" },
    { id: 7, name: "Sorting", chapter: "Chapter 7", difficulty: "medium" },
    { id: 8, name: "Debugging", chapter: "Chapter 8", difficulty: "easy" }
  ];

  STATE.topics.forEach(t => {
    STATE.topicScores[t.id] = { correct: 0, total: 0 };
  });

  STATE.syllabus = "CS101 Introduction to Programming. Topics: Variables, Loops, Functions, Arrays, OOP, Recursion, Sorting, Debugging.";

  // Step 1 — Show Jake failing
  showDemoMessage("Meet Jake. CS101 midterm result: 58% 😢", "low");
  drawKnowledgeGraph();

  await sleep(2000);

  // Step 2 — AI detects weak areas
  showDemoMessage("AI detected 3 weak areas: Recursion, OOP Basics, Sorting", "mid");
  await sleep(2000);

  // Step 3 — Simulate Jake studying Day 1
  showDemoMessage("Day 1 — Jake studies Recursion and OOP...", "mid");
  document.getElementById("plan-result").textContent =
    "Day 1: Recursion, OOP Basics\nDay 2: Sorting, Arrays\nDay 3: Review + Practice Papers";

  await sleep(1500);

  // Simulate wrong answers on hard topics
  STATE.topicScores[5] = { correct: 1, total: 3 }; // OOP — struggling
  STATE.topicScores[6] = { correct: 1, total: 3 }; // Recursion — struggling
  STATE.topicScores[7] = { correct: 1, total: 2 }; // Sorting — struggling
  STATE.topicScores[1] = { correct: 2, total: 2 }; // Variables — good
  STATE.topicScores[8] = { correct: 2, total: 2 }; // Debugging — good

  STATE.topics.forEach(t => updateNodeColor(t.id));
  updateExamPredictor();

  await sleep(2000);

  // Step 4 — Show Day 2 improvement
  showDemoMessage("Day 2 — Adaptive quiz pushes harder on weak topics...", "mid");
  await sleep(1500);

  STATE.topicScores[5] = { correct: 3, total: 4 }; // OOP — improving
  STATE.topicScores[6] = { correct: 3, total: 4 }; // Recursion — improving
  STATE.topicScores[7] = { correct: 2, total: 3 }; // Sorting — improving
  STATE.topics.forEach(t => updateNodeColor(t.id));
  updateExamPredictor();

  await sleep(2000);

  // Step 5 — Day 3 mastery
  showDemoMessage("Day 3 — Jake is ready. Retaking the exam...", "mid");
  await sleep(1500);

  // All topics now green
  STATE.topicScores[1] = { correct: 3, total: 3 };
  STATE.topicScores[2] = { correct: 3, total: 3 };
  STATE.topicScores[3] = { correct: 3, total: 3 };
  STATE.topicScores[4] = { correct: 3, total: 3 };
  STATE.topicScores[5] = { correct: 4, total: 5 };
  STATE.topicScores[6] = { correct: 4, total: 5 };
  STATE.topicScores[7] = { correct: 3, total: 4 };
  STATE.topicScores[8] = { correct: 3, total: 3 };

  STATE.questionCount = 10;
  STATE.topics.forEach(t => updateNodeColor(t.id));
  updateExamPredictor();

  await sleep(1500);

  // Final result
  showDemoMessage("Jake retakes CS101 exam — Result: 98% 🥇 From 58% to 98% in 3 days!", "high");

  // Load a real question for judges to try
  document.getElementById("question-text").textContent =
    "What is recursion? Give an example of a recursive function and explain the base case.";
  document.getElementById("answer-input").value = "";
  document.getElementById("feedback-box").textContent =
    "Jake answered this correctly on Day 3. Can you?";
  document.getElementById("feedback-box").className = "";
});

function showDemoMessage(message, level) {
  const predictor = document.getElementById("prediction-result");
  const colors = { high: "#1db954", mid: "#f0a500", low: "#e05555" };
  predictor.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:${colors[level]};line-height:1.6;padding:8px 0">
      ${message}
    </div>`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}