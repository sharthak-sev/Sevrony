/**
 * Endpoints that already shipped: vocabulary AI sentence checking, the consent
 * acknowledgement, and the Discord feedback relay.
 *
 * Behaviour here is a straight port of cloudflare-worker.js. The two deliberate
 * changes are noted inline: the WORKER_API_KEY check is now scoped to this
 * handler (it used to gate every route, including ones the browser must reach
 * unauthenticated), and rate limiting moved to the router.
 */

import { json } from "./http.js";

/**
 * POST /api/consent
 *
 * Consent is a product-state acknowledgement. Never return a client encryption
 * key here: any value delivered to browser JavaScript can be read or replayed
 * through DevTools and does not protect local data.
 */
export function handleConsent(cors) {
  return json({ success: true, message: "Consent logged successfully." }, 200, cors);
}

/** POST /api/feedback -- multipart form relayed to a Discord webhook. */
export async function handleFeedback(request, env, cors) {
  const formData = await request.formData();
  const type = formData.get("type");
  const message = formData.get("message");
  const email = formData.get("email") || "Not provided";
  const contextStr = formData.get("context") || "{}";
  const files = formData.getAll("file");

  if (!message) return json({ error: "Message is required" }, 400, cors);

  const discordWebhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) throw new Error("DISCORD_WEBHOOK_URL is not configured in worker environment.");

  let context;
  try {
    context = JSON.parse(contextStr);
  } catch (e) {
    context = {};
  }

  const discordPayload = new FormData();
  const embed = {
    title: `New Feedback: ${type}`,
    color: type === "Bug" ? 16711680 : type === "Feature" ? 65280 : 3447003,
    fields: [
      { name: "Message", value: String(message).substring(0, 1024) },
      { name: "Email", value: email, inline: true },
      { name: "App Version", value: context.version || "Unknown", inline: true },
      { name: "Route / Hash", value: context.urlHash || "Unknown", inline: true },
      { name: "User Agent", value: (context.userAgent || "Unknown").substring(0, 1024) },
      { name: "Viewport", value: context.viewport || "Unknown", inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  discordPayload.append("payload_json", JSON.stringify({ embeds: [embed] }));

  if (files && files.length > 0) {
    files.slice(0, 5).forEach((file, index) => {
      if (file && file.size > 0) {
        discordPayload.append(`file${index}`, file, file.name || `screenshot_${index}.png`);
      }
    });
  }

  const discordRes = await fetch(discordWebhookUrl, { method: "POST", body: discordPayload });
  if (!discordRes.ok) throw new Error(`Discord API error: ${discordRes.statusText}`);

  return json({ success: true }, 200, cors);
}

/**
 * Verify a Turnstile token against siteverify.
 *
 * `expectedAction` is only enforced when passed. The vocabulary path
 * intentionally leaves it unset so its behaviour is byte-for-byte what shipped;
 * the catalog path passes its own action so a token minted for one endpoint
 * cannot be replayed against the other.
 */
export async function verifyTurnstile(token, ip, env, expectedAction) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return { ok: false, status: 500, error: "Turnstile secret not configured" };

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (!data.success) {
    return { ok: false, status: 403, error: "Security check failed", details: data["error-codes"] };
  }
  if (expectedAction && data.action && data.action !== expectedAction) {
    return { ok: false, status: 403, error: "Security check failed", details: ["action-mismatch"] };
  }
  return { ok: true, data };
}

/** POST / -- Gemini-backed vocabulary sentence evaluation. */
export async function handleVocabCheck(request, env, ip, cors) {
  // Optional shared-secret gate. Enforced only when WORKER_API_KEY is set, which
  // matches the original behaviour -- vocab.js still sends a placeholder value,
  // so setting this secret would lock out the shipped frontend.
  const expectedApiKey = env.WORKER_API_KEY;
  if (expectedApiKey) {
    const clientApiKey =
      request.headers.get("X-API-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
    if (clientApiKey !== expectedApiKey) return json({ error: "Unauthorized. Invalid API Key." }, 401, cors);
  }

  const body = await request.json();
  const { word, meaning, sentence, "cf-turnstile-response": token } = body;

  if (!word || !meaning || !sentence || !token) {
    return json({ error: "Missing parameters or security token" }, 400, cors);
  }

  const verified = await verifyTurnstile(token, ip, env);
  if (!verified.ok) {
    return json({ error: verified.error, details: verified.details }, verified.status, cors);
  }

  if (sentence.length < 5 || sentence.length > 500) {
    return json(
      {
        isValid: false,
        feedback: "Your sentence length is inappropriate for evaluation. Please write a normal sentence.",
      },
      200,
      cors
    );
  }

  const apiKey = env.GEMINI_API_KEY;
  const modelName = env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const aiPrompt = `You are an English teacher evaluating a high school student's vocabulary practice.
The student was asked to use the word "${word}" in a sentence.
The meaning of the word is: ${meaning}

Student's sentence: "${sentence}"

Evaluate if the sentence demonstrates a clear understanding of the word's meaning and uses it grammatically correctly.
Output ONLY valid JSON with no markdown formatting. The JSON must have exactly this structure:
{
  "isValid": boolean,
  "feedback": "short, encouraging, teacher-like explanation"
}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: aiPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            isValid: { type: "boolean", description: "Whether the sentence correctly uses the word." },
            feedback: { type: "string", description: "Teacher-like explanation of the result." },
          },
          required: ["isValid", "feedback"],
        },
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch from Gemini: ${errorText}`);
  }

  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text;
  return json(JSON.parse(text), 200, cors);
}
