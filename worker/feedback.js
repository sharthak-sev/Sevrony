/**
 * worker/feedback.js -- Two-way feedback system backed by Cloudflare D1.
 *
 * Provides Google OAuth token authentication, role separation (Admin vs User),
 * thread creation, replies, status management, WebP image attachments,
 * unread badges, and optional Discord notifications.
 */

import { json } from "./http.js";

/** In-memory cache for validated Google OAuth tokens (TTL: 10 minutes) */
const tokenCache = new Map();

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Authenticates the caller using their Google OAuth access token or an Admin Key.
 */
export async function authenticateFeedbackUser(request, env) {
  // 1. Direct Admin Key header bypass (for CLI tools, scripts, or testing)
  const adminKey = request.headers.get("X-Admin-Key");
  if (adminKey && env.ADMIN_KEY && timingSafeEqual(adminKey, env.ADMIN_KEY)) {
    return {
      email: env.ADMIN_EMAIL || "admin@sevrony.internal",
      isAdmin: true,
    };
  }

  // 2. Google OAuth Bearer Token
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) {
    return { email: cached.email, isAdmin: cached.isAdmin };
  }

  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      tokenCache.delete(token);
      return null;
    }

    const info = await res.json();
    if (!info || !info.email) return null;

    const email = String(info.email).toLowerCase();
    const adminEmail = (env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isAdmin = Boolean(adminEmail && email === adminEmail);

    // Cache valid auth state for 10 minutes
    tokenCache.set(token, {
      email,
      isAdmin,
      expiresAt: now + 10 * 60 * 1000,
    });

    return { email, isAdmin };
  } catch (err) {
    console.error("Google userinfo verification failed:", err);
    return null;
  }
}

/**
 * Send fire-and-forget Discord alert when users submit new feedback or replies.
 */
async function notifyDiscord(env, { threadId, subject, type, email, message, isNewThread }) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  try {
    const title = isNewThread
      ? `💬 New Feedback Thread: [${type}] ${subject}`
      : `💬 New User Reply on Thread: ${subject || threadId}`;

    const embed = {
      title: title.substring(0, 256),
      color: type === "Bug" ? 16711680 : type === "Feature" ? 65280 : 3447003,
      fields: [
        { name: "From", value: email || "Anonymous", inline: true },
        { name: "Thread ID", value: threadId, inline: true },
        { name: "Message", value: String(message || "").substring(0, 1024) },
      ],
      timestamp: new Date().toISOString(),
    };

    const payload = new FormData();
    payload.append("payload_json", JSON.stringify({ embeds: [embed] }));

    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      body: payload,
    });
  } catch (e) {
    console.error("Discord feedback notification error:", e);
  }
}

/**
 * GET /api/feedback/threads -- List threads.
 */
export async function handleListThreads(request, env, cors, user) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ error: "FEEDBACK_DB is not configured." }, 500, cors);

  let threadsQuery;
  let unreadQuery;

  if (user.isAdmin) {
    threadsQuery = db.prepare(`
      SELECT 
        t.id, t.user_email, t.subject, t.type, t.status, 
        t.user_unread, t.admin_unread, t.created_at, t.updated_at,
        (SELECT content FROM feedback_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT sender_role FROM feedback_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id) AS message_count
      FROM feedback_threads t
      ORDER BY t.updated_at DESC
      LIMIT 100
    `).all();

    unreadQuery = db.prepare(`
      SELECT COUNT(*) AS count FROM feedback_threads WHERE admin_unread = 1
    `).first();
  } else {
    threadsQuery = db.prepare(`
      SELECT 
        t.id, t.user_email, t.subject, t.type, t.status, 
        t.user_unread, t.admin_unread, t.created_at, t.updated_at,
        (SELECT content FROM feedback_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT sender_role FROM feedback_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
        (SELECT COUNT(*) FROM feedback_messages m WHERE m.thread_id = t.id) AS message_count
      FROM feedback_threads t
      WHERE t.user_email = ?
      ORDER BY t.updated_at DESC
      LIMIT 50
    `).bind(user.email).all();

    unreadQuery = db.prepare(`
      SELECT COUNT(*) AS count FROM feedback_threads WHERE user_email = ? AND user_unread = 1
    `).bind(user.email).first();
  }

  const [threadsRes, unreadRes] = await Promise.all([threadsQuery, unreadQuery]);
  const threads = threadsRes?.results || [];
  const unreadCount = Number(unreadRes?.count || 0);

  return json({
    threads,
    unreadCount,
    isAdmin: user.isAdmin,
    userEmail: user.email,
  }, 200, cors);
}

/**
 * GET /api/feedback/threads/:id -- Fetch thread details and messages.
 */
export async function handleGetThread(request, env, cors, user, threadId) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ error: "FEEDBACK_DB is not configured." }, 500, cors);

  const thread = await db.prepare("SELECT * FROM feedback_threads WHERE id = ?").bind(threadId).first();
  if (!thread) return json({ error: "Thread not found." }, 404, cors);

  if (!user.isAdmin && thread.user_email !== user.email) {
    return json({ error: "Forbidden. You cannot view this thread." }, 403, cors);
  }

  const messagesRes = await db.prepare(`
    SELECT id, thread_id, sender_role, sender_email, content, created_at
    FROM feedback_messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `).bind(threadId).all();

  const messages = messagesRes?.results || [];

  // Fetch attachments for these messages
  if (messages.length > 0) {
    const placeholders = messages.map(() => "?").join(",");
    const messageIds = messages.map(m => m.id);
    const attachRes = await db.prepare(`
      SELECT id, message_id, mime_type, data, created_at
      FROM feedback_attachments
      WHERE message_id IN (${placeholders})
      ORDER BY created_at ASC
    `).bind(...messageIds).all();

    const attachByMsg = {};
    for (const att of (attachRes?.results || [])) {
      if (!attachByMsg[att.message_id]) attachByMsg[att.message_id] = [];
      attachByMsg[att.message_id].push(att);
    }

    for (const msg of messages) {
      msg.attachments = attachByMsg[msg.id] || [];
    }
  }

  // Mark thread as read for current user
  if (user.isAdmin && thread.admin_unread === 1) {
    await db.prepare("UPDATE feedback_threads SET admin_unread = 0 WHERE id = ?").bind(threadId).run();
    thread.admin_unread = 0;
  } else if (!user.isAdmin && thread.user_unread === 1) {
    await db.prepare("UPDATE feedback_threads SET user_unread = 0 WHERE id = ?").bind(threadId).run();
    thread.user_unread = 0;
  }

  return json({
    thread,
    messages,
    isAdmin: user.isAdmin,
    userEmail: user.email,
  }, 200, cors);
}

/**
 * POST /api/feedback/threads -- Create new feedback thread.
 */
export async function handleCreateThread(request, env, cors, user) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ error: "FEEDBACK_DB is not configured." }, 500, cors);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const subject = String(body.subject || "").trim();
  const type = String(body.type || "General").trim();
  const message = String(body.message || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!subject) return json({ error: "Subject is required." }, 400, cors);
  if (!message) return json({ error: "Message is required." }, 400, cors);
  if (subject.length > 200) return json({ error: "Subject too long (max 200 characters)." }, 400, cors);
  if (message.length > 10000) return json({ error: "Message too long (max 10000 characters)." }, 400, cors);
  if (attachments.length > 5) return json({ error: "Maximum 5 attachments allowed." }, 400, cors);

  const now = Date.now();
  const threadId = crypto.randomUUID();
  const messageId = crypto.randomUUID();

  const statements = [
    db.prepare(`
      INSERT INTO feedback_threads (id, user_email, subject, type, status, user_unread, admin_unread, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', 0, 1, ?, ?)
    `).bind(threadId, user.email, subject, type, now, now),
    db.prepare(`
      INSERT INTO feedback_messages (id, thread_id, sender_role, sender_email, content, created_at)
      VALUES (?, ?, 'user', ?, ?, ?)
    `).bind(messageId, threadId, user.email, message, now),
  ];

  for (const att of attachments) {
    if (att && att.data) {
      const attId = crypto.randomUUID();
      const mime = String(att.mime_type || "image/webp").toLowerCase();
      const dataStr = String(att.data);
      // Limit base64 attachment to ~500KB to protect DB limits
      if (dataStr.length > 700000) {
        return json({ error: "Attachment image too large. Please compress before sending." }, 400, cors);
      }
      statements.push(
        db.prepare(`
          INSERT INTO feedback_attachments (id, message_id, mime_type, data, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(attId, messageId, mime, dataStr, now)
      );
    }
  }

  await db.batch(statements);

  // Notify Discord
  notifyDiscord(env, {
    threadId,
    subject,
    type,
    email: user.email,
    message,
    isNewThread: true,
  });

  return json({ success: true, threadId }, 201, cors);
}

/**
 * POST /api/feedback/threads/:id/messages -- Reply to a thread.
 */
export async function handleReplyThread(request, env, cors, user, threadId) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ error: "FEEDBACK_DB is not configured." }, 500, cors);

  const thread = await db.prepare("SELECT * FROM feedback_threads WHERE id = ?").bind(threadId).first();
  if (!thread) return json({ error: "Thread not found." }, 404, cors);

  if (!user.isAdmin && thread.user_email !== user.email) {
    return json({ error: "Forbidden. You cannot reply to this thread." }, 403, cors);
  }

  if (thread.status === "resolved" || thread.status === "closed") {
    return json({ error: "This discussion is resolved and cannot receive new replies. Please reopen it or start a new discussion." }, 400, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const message = String(body.message || "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!message && attachments.length === 0) {
    return json({ error: "Message or attachment is required." }, 400, cors);
  }
  if (message.length > 10000) return json({ error: "Message too long (max 10000 characters)." }, 400, cors);
  if (attachments.length > 5) return json({ error: "Maximum 5 attachments allowed." }, 400, cors);

  const now = Date.now();
  const messageId = crypto.randomUUID();
  const senderRole = user.isAdmin ? "admin" : "user";

  const statements = [
    db.prepare(`
      INSERT INTO feedback_messages (id, thread_id, sender_role, sender_email, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(messageId, threadId, senderRole, user.email, message, now),
  ];

  for (const att of attachments) {
    if (att && att.data) {
      const attId = crypto.randomUUID();
      const mime = String(att.mime_type || "image/webp").toLowerCase();
      const dataStr = String(att.data);
      if (dataStr.length > 700000) {
        return json({ error: "Attachment image too large." }, 400, cors);
      }
      statements.push(
        db.prepare(`
          INSERT INTO feedback_attachments (id, message_id, mime_type, data, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(attId, messageId, mime, dataStr, now)
      );
    }
  }

  // Update thread flags:
  // If admin sent message: user_unread = 1, admin_unread = 0
  // If user sent message: admin_unread = 1, user_unread = 0
  const userUnread = user.isAdmin ? 1 : 0;
  const adminUnread = user.isAdmin ? 0 : 1;

  statements.push(
    db.prepare(`
      UPDATE feedback_threads
      SET updated_at = ?, user_unread = ?, admin_unread = ?
      WHERE id = ?
    `).bind(now, userUnread, adminUnread, threadId)
  );

  await db.batch(statements);

  if (!user.isAdmin) {
    notifyDiscord(env, {
      threadId,
      subject: thread.subject,
      type: thread.type,
      email: user.email,
      message,
      isNewThread: false,
    });
  }

  return json({ success: true, messageId }, 201, cors);
}

/**
 * PATCH /api/feedback/threads/:id -- Update thread status (open / resolved / closed).
 */
export async function handleUpdateThreadStatus(request, env, cors, user, threadId) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ error: "FEEDBACK_DB is not configured." }, 500, cors);

  const thread = await db.prepare("SELECT * FROM feedback_threads WHERE id = ?").bind(threadId).first();
  if (!thread) return json({ error: "Thread not found." }, 404, cors);

  if (!user.isAdmin) {
    return json({ error: "Forbidden: Only administrators can update discussion status." }, 403, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const status = String(body.status || "").toLowerCase().trim();
  if (!["open", "resolved", "closed"].includes(status)) {
    return json({ error: "Invalid status. Must be open, resolved, or closed." }, 400, cors);
  }

  const now = Date.now();
  await db.prepare("UPDATE feedback_threads SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, threadId).run();

  return json({ success: true, status }, 200, cors);
}

/**
 * GET /api/feedback/unread -- Lightweight unread count check.
 */
export async function handleUnreadCheck(request, env, cors, user) {
  const db = env.FEEDBACK_DB;
  if (!db) return json({ unreadCount: 0, isAdmin: user.isAdmin }, 200, cors);

  let unreadQuery;
  if (user.isAdmin) {
    unreadQuery = db.prepare("SELECT COUNT(*) AS count FROM feedback_threads WHERE admin_unread = 1").first();
  } else {
    unreadQuery = db.prepare("SELECT COUNT(*) AS count FROM feedback_threads WHERE user_email = ? AND user_unread = 1").bind(user.email).first();
  }

  const res = await unreadQuery;
  return json({
    unreadCount: Number(res?.count || 0),
    isAdmin: user.isAdmin,
  }, 200, cors);
}
