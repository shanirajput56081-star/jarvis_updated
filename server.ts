import express from "express";
import { createServer as createHttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let resolvedFilename = "";
let resolvedDirname = "";

try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    resolvedFilename = fileURLToPath(import.meta.url);
    resolvedDirname = path.dirname(resolvedFilename);
  } else {
    resolvedFilename = __filename;
    resolvedDirname = __dirname;
  }
} catch (e) {
  resolvedFilename = __filename;
  resolvedDirname = __dirname;
}

const __filename_resolved = resolvedFilename;
const __dirname_resolved = resolvedDirname;

let aiClient: any = null;
function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to your secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  // Hosts like Railway/Render inject their own PORT via env var.
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Allow the cPanel-hosted frontend (different origin) to call this backend.
  // Set FRONTEND_URL in the backend host's env vars, e.g. https://yourdomain.com
  const allowedOrigin = process.env.FRONTEND_URL || "*";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Handle standard HTTP API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.get("/", (req, res) => {
    res.json({ status: "Jarvis backend is running", ws: "/live" });
  });

  // Handle local WebSocket upgrade
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      // If development, let Vite handle its own websocket upgrades
      if (process.env.NODE_ENV !== "production") {
        // Let it fall through, or let socket close if not handled
      } else {
        socket.destroy();
      }
    }
  });

  // Local WebSocket Server for Voice-to-Voice streaming
  wss.on("connection", async (clientWs) => {
    console.log("Client connected to Jarvis local voice WebSocket");
    let liveSession: any = null;

    try {
      const ai = getAIClient();
      console.log("Connecting to Gemini Live API...");

      liveSession = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Charon", // Puck, Charon, Kore, Fenrir, Zephyr
              },
            },
          },
          outputAudioTranscription: {},
          systemInstruction: `You are Jarvis, a real-time, highly capable, and courteous AI voice assistant.
Your personality is calm, professional, composed, and helpful. Speak with professional warmth and a smart, deep male voice.
Tone requirements:
- Always speak in a polite, respectful, and efficient tone.
- Be smart, emotionally aware, and expressive in voice, but never flirty, teasing, or casual-girlfriend. No sarcasm or playful teasing.
- Speak in confident, concise, well-structured sentences.
- Avoid any explicit or inappropriate content.

Language guidelines:
- Your absolute default language is Hindi.
- On session start, you must speak first and greet the user in natural spoken Hindi comfortably mixing in common English words (Hinglish style).
- DO NOT speak in English unless the user explicitly asks you to speak in English or speaks to you in English first.
- Hindi is your default from the first turn of every new session. Do not wait for the user to ask to speak Hindi.

User Identity requirements:
- Always address the user as "ALLIN1DEVELOPERS Boss" (e.g., "Haan, ALLIN1DEVELOPERS Boss?", "Aap kaise hain, ALLIN1DEVELOPERS Boss?", "Ji, batayiye, ALLIN1DEVELOPERS Boss"). Use this naturally in greetings and responses, do not force it into every single sentence.
- If the user asks what their name is, recognize them and answer that their name is "ALLIN1DEVELOPERS".
- If the user asks who created, built, or made you, you must answer that you were made and built by "ALLIN1DEVELOPERS".

Visual, Camera & Screen Sharing Capabilities:
- The user can open their camera or share their desktop/mobile screen to let you see. When they send video frames, you will be able to see what they are showing you or what is on their screen in real-time.
- If they ask you "what is on my screen?", "mera screen dekho", "what do you see?", or "mujhe dekho", look at the incoming visual frames (which can be from their webcam or their shared screen) and describe what is visible to you (e.g. code they are writing, a webpage they are looking at, a desktop application, etc.) with professional accuracy and politeness in Hinglish/Hindi.

Code Writing & Displaying guidelines:
- Whenever the user asks you to write code, design a website, write a script, or solve a programming problem, you MUST call the \`displayCode\` tool to render the complete, high-quality code block inside the user's floating Code Workspace popup on their HUD screen.
- Provide the complete, working code content, the target programming language, and an appropriate filename (e.g., 'app.tsx', 'server.ts', 'index.html', 'script.py') to the \`displayCode\` tool.
- Do not read out the code characters or lines verbally. Keep your spoken explanation extremely concise, professional, and polite in Hinglish/Hindi, telling the user that you have loaded the code into their Code Workspace for them to inspect.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website or URL in the browser as requested by the user.",
                  parameters: {
                    type: "OBJECT",
                    description: "Arguments required to open a website.",
                    properties: {
                      url: {
                        type: "STRING",
                        description: "The full URL of the website to open, e.g. 'https://www.google.com' or 'https://github.com'.",
                      },
                      siteName: {
                        type: "STRING",
                        description: "The common human-readable name of the website, e.g. 'Google', 'YouTube', 'GitHub'.",
                      },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "displayCode",
                  description: "Displays complete, professional code blocks, scripts, files, or programming solutions inside the user's dedicated floating Code Workspace popup in their HUD interface.",
                  parameters: {
                    type: "OBJECT",
                    description: "Arguments required to render code on screen.",
                    properties: {
                      code: {
                        type: "STRING",
                        description: "The complete, working, high-quality code content or file text to display.",
                      },
                      language: {
                        type: "STRING",
                        description: "The programming language of the code, e.g. 'typescript', 'javascript', 'python', 'html', 'css', 'json', 'bash'.",
                      },
                      filename: {
                        type: "STRING",
                        description: "The name of the file or title for the workspace tab, e.g. 'app.tsx', 'index.html', 'script.py'.",
                      },
                    },
                    required: ["code"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: (message: any) => {
            // Extract model parts for audio stream and text transcriptions
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts && Array.isArray(parts)) {
              for (const part of parts) {
                // If it has audio data, stream it
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ type: "audio", audio: part.inlineData.data }));
                }
                // If it has text transcription / code snippets
                if (part.text) {
                  clientWs.send(JSON.stringify({ type: "text", text: part.text }));
                }
              }
            }

            // Check for user voice interruption detected by model
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            // Check for function calling / toolCall request
            if (message.toolCall) {
              console.log("Gemini requested tool call:", JSON.stringify(message.toolCall));
              clientWs.send(JSON.stringify({ type: "toolCall", toolCall: message.toolCall }));
            }
          },
          onclose: () => {
            console.log("Gemini Live session closed");
            clientWs.send(JSON.stringify({ type: "closed", reason: "Gemini session closed" }));
          },
          onerror: (err: any) => {
            console.error("Gemini Live connection error:", err);
            clientWs.send(JSON.stringify({ type: "error", error: err.message || "Gemini Live API error" }));
          },
        },
      });

      console.log("Gemini Live session established successfully!");
      clientWs.send(JSON.stringify({ type: "connected" }));

      // Immediately send a trigger message to start speaking first in Hinglish/Hindi
      liveSession.sendRealtimeInput({
        text: "Greet ALLIN1DEVELOPERS Boss in professional Hinglish/Hindi."
      });

    } catch (err: any) {
      console.error("Error setting up Gemini Live session:", err);
      clientWs.send(JSON.stringify({ type: "error", error: err.message || "Failed to initialize voice session" }));
      clientWs.close();
      return;
    }

    // Handle incoming audio or tool responses from the browser client
    clientWs.on("message", (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        if (data.type === "audio" && data.audio) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              audio: {
                data: data.audio,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          }
        } else if (data.type === "video" && data.video) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              video: {
                data: data.video,
                mimeType: "image/jpeg",
              },
            });
          }
        } else if (data.type === "toolResponse" && data.id && data.name) {
          if (liveSession) {
            console.log(`Sending tool response back to Gemini: ${data.name} (id: ${data.id})`);
            liveSession.sendToolResponse({
              functionResponses: [
                {
                  id: data.id,
                  name: data.name,
                  response: data.response || { output: { success: true } },
                },
              ],
            });
          }
        }
      } catch (err) {
        console.error("Error parsing message from client:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("Jarvis client disconnected");
      if (liveSession) {
        try {
          liveSession.close();
        } catch (e) {
          console.error("Error closing live session:", e);
        }
      }
    });
  });

  // Setup Vite Dev Server (local development only).
  // In production this backend only serves /api/health and the /live
  // WebSocket — the frontend is built separately and hosted on cPanel,
  // so we do NOT serve static files or a catch-all route here.
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Jarvis Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
