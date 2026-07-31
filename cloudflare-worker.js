export default {
  async fetch(request, env) {
    // 1. Handle CORS so your frontend can call this endpoint
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // You can restrict this to your frontend URL in production
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response("Vocabulary AI Worker is running! Please send a POST request with { word, meaning, sentence }.", { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      // --- API Key Authentication ---
      const expectedApiKey = env.WORKER_API_KEY;
      const clientApiKey = request.headers.get("X-API-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
      
      // Only enforce if the secret is configured in the environment
      if (expectedApiKey && clientApiKey !== expectedApiKey) {
        return new Response(JSON.stringify({ error: "Unauthorized. Invalid API Key." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const urlObj = new URL(request.url);

      // --- Rate Limiting (In-Memory per Edge Server) ---
      // Max 5 requests per 10 seconds per IP (shared across endpoints for simplicity)
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const now = Date.now();
      if (!globalThis.rateLimits) globalThis.rateLimits = new Map();
      
      const userLimits = globalThis.rateLimits.get(ip) || [];
      const recentRequests = userLimits.filter(time => now - time < 10000);
      
      if (recentRequests.length >= 5) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a few seconds before trying again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recentRequests.push(now);
      globalThis.rateLimits.set(ip, recentRequests);


      // --- Routing ---
      if (urlObj.pathname === "/api/consent") {
        // Handle Privacy Policy Consent
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405, headers: corsHeaders });
        }
        
        // In a real app, you might log the IP to a KV store or external DB here
        // For now, we just return the master key required to unlock the local database
        const appKey = env.APP_ENCRYPTION_KEY || "sevrony_fallback_master_key_9312";
        
        return new Response(JSON.stringify({ 
          success: true, 
          key: appKey,
          message: "Consent logged successfully."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } else if (urlObj.pathname === "/api/feedback") {
        // Handle Feedback Submission
        const formData = await request.formData();
        const type = formData.get("type");
        const message = formData.get("message");
        const email = formData.get("email") || "Not provided";
        const contextStr = formData.get("context") || "{}";
        const files = formData.getAll("file");

        if (!message) {
          return new Response(JSON.stringify({ error: "Message is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const discordWebhookUrl = env.DISCORD_WEBHOOK_URL;
        if (!discordWebhookUrl) {
          throw new Error("DISCORD_WEBHOOK_URL is not configured in worker environment.");
        }

        let context;
        try {
          context = JSON.parse(contextStr);
        } catch(e) {
          context = {};
        }

        const discordPayload = new FormData();
        const embed = {
          title: `New Feedback: ${type}`,
          color: type === "Bug" ? 16711680 : type === "Feature" ? 65280 : 3447003,
          fields: [
            { name: "Message", value: message.substring(0, 1024) },
            { name: "Email", value: email, inline: true },
            { name: "App Version", value: context.version || "Unknown", inline: true },
            { name: "Route / Hash", value: context.urlHash || "Unknown", inline: true },
            { name: "User Agent", value: (context.userAgent || "Unknown").substring(0, 1024) },
            { name: "Viewport", value: context.viewport || "Unknown", inline: true }
          ],
          timestamp: new Date().toISOString()
        };

        discordPayload.append("payload_json", JSON.stringify({ embeds: [embed] }));

        if (files && files.length > 0) {
          files.slice(0, 5).forEach((file, index) => {
            if (file && file.size > 0) {
              discordPayload.append(`file${index}`, file, file.name || `screenshot_${index}.png`);
            }
          });
        }

        const discordRes = await fetch(discordWebhookUrl, {
          method: "POST",
          body: discordPayload
        });

        if (!discordRes.ok) {
          throw new Error(`Discord API error: ${discordRes.statusText}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } else {
        // Default: Vocabulary AI checking
        const body = await request.json();
        const { word, meaning, sentence, "cf-turnstile-response": token } = body;

        if (!word || !meaning || !sentence || !token) {
          return new Response(JSON.stringify({ error: "Missing parameters or security token" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // --- Turnstile Verification ---
        const turnstileSecret = env.TURNSTILE_SECRET;
        if (!turnstileSecret) {
          return new Response(JSON.stringify({ error: "Turnstile secret not configured" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const turnstileFormData = new FormData();
        turnstileFormData.append("secret", turnstileSecret);
        turnstileFormData.append("response", token);
        turnstileFormData.append("remoteip", ip);

        const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: turnstileFormData
        });

        const turnstileData = await turnstileRes.json();
        if (!turnstileData.success) {
          return new Response(JSON.stringify({ error: "Security check failed", details: turnstileData["error-codes"] }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }


        if (sentence.length < 5 || sentence.length > 500) {
          return new Response(
            JSON.stringify({
              isValid: false,
              feedback: "Your sentence length is inappropriate for evaluation. Please write a normal sentence.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const apiKey = env.GEMINI_API_KEY; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

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
                  feedback: { type: "string", description: "Teacher-like explanation of the result." }
                },
                required: ["isValid", "feedback"]
              },
              temperature: 0.1
            },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to fetch from Gemini: ${errorText}`);
        }

        const data = await res.json();
        const text = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(text);

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
