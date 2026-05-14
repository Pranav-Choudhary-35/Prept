"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { currentUser } from "@clerk/nextjs/server";

const CATEGORY_PROMPTS = {
  FRONTEND: "React, JavaScript, CSS, performance, accessibility, browser APIs",
  BACKEND:
    "Node.js, REST APIs, databases, authentication, caching, scalability",
  FULLSTACK:
    "full-stack architecture, API design, state management, deployment",
  DSA: "data structures, algorithms, time complexity, problem solving",
  SYSTEM_DESIGN:
    "distributed systems, scalability, databases, microservices, caching",
  BEHAVIORAL:
    "leadership, teamwork, conflict resolution, career growth, STAR method",
  DEVOPS: "CI/CD, Docker, Kubernetes, cloud infrastructure, monitoring",
  MOBILE:
    "React Native, iOS/Android, performance, offline support, app lifecycle",
};

export const generateInterviewQuestions = async ({ category }) => {
  try {
    // Validate user
    const user = await currentUser();
    if (!user) throw new Error("Unauthorized");

    // Validate category
    if (!category || !CATEGORY_PROMPTS[category]) {
      throw new Error(`Invalid category: ${category}`);
    }

    // Validate environment variable
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `You are an expert technical interviewer. Generate 6 interview questions for a ${category} role covering: ${CATEGORY_PROMPTS[category]}.

For each question, provide a concise but complete answer (2-4 sentences) that an interviewer can use to evaluate responses.

Respond ONLY with a valid JSON array. No markdown, no backticks, no explanation. Example format:
[{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // More robust JSON extraction - remove markdown code blocks
    let clean = text
      .replace(/^```json\s*/gm, "")
      .replace(/^```\s*/gm, "")
      .replace(/\s*```$/gm, "")
      .trim();

    // Parse JSON
    let questions;
    try {
      questions = JSON.parse(clean);
    } catch (parseError) {
      console.error("JSON parse error. Raw text:", text);
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }

    // Validate parsed data structure
    if (!Array.isArray(questions)) {
      throw new Error("AI response is not an array");
    }

    if (questions.length === 0) {
      throw new Error("AI returned empty questions array");
    }

    // Validate each question has required fields
    questions.forEach((q, index) => {
      if (!q.question || typeof q.question !== "string") {
        throw new Error(`Question ${index + 1} missing or invalid "question" field`);
      }
      if (!q.answer || typeof q.answer !== "string") {
        throw new Error(`Question ${index + 1} missing or invalid "answer" field`);
      }
    });

    return { questions };
  } catch (error) {
    console.error("Error generating interview questions:", error);
    throw error;
  }
};
