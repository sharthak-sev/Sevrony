/**
 * feedback.js -- 2-Way Feedback & Discussions Hub in Sevrony.
 *
 * Provides:
 * 1. Dedicated Feedback Hub view (#feedback) with discussions list & active chat pane.
 * 2. Classic glassmorphic "Send Feedback" modal with WebP compression when creating discussions.
 * 3. In-app unread notifications & admin management.
 */

(function () {
  "use strict";

  const feedbackState = {
    threads: [],
    activeThreadId: null,
    activeThreadData: null,
    filter: "all", // 'all' | 'open' | 'resolved'
    unreadCount: 0,
    isAdmin: false,
    loading: false,
    sending: false,
    pendingAttachments: [],
  };

  let unreadCheckTimer = null;

  // ─── WebP Compression ────────────────────────────────────────────────

  async function compressToWebP(file, maxDimension = 1280, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        return reject(new Error("Selected file is not an image."));
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          let dataUrl = canvas.toDataURL("image/webp", quality);
          let mimeType = "image/webp";
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/jpeg", quality);
            mimeType = "image/jpeg";
          }

          const cleanName = (file.name || "screenshot")
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_") + (mimeType === "image/webp" ? ".webp" : ".jpg");

          resolve({
            mime_type: mimeType,
            data: dataUrl,
            name: cleanName,
            size: Math.round((dataUrl.length * 3) / 4),
          });
        };
        img.onerror = () => reject(new Error("Failed to process image"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  // ─── API Helpers ─────────────────────────────────────────────────────

  function getCachedGoogleToken() {
    const rawStored = localStorage.getItem("sevrony.syncToken");
    if (rawStored) {
      try {
        const parsed = JSON.parse(rawStored);
        if (parsed.token && parsed.expiry > Date.now() + 10000) {
          return parsed.token;
        }
      } catch (_) {}
    }
    return null;
  }

  async function getAuthHeaders() {
    const token = getCachedGoogleToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async function fetchApi(path, options = {}) {
    const headers = await getAuthHeaders();
    const mergedHeaders = { ...headers, ...(options.headers || {}) };
    const url = window.SevApi ? window.SevApi.url(path) : path;
    const res = await fetch(url, { ...options, headers: mergedHeaders });
    if (!res.ok) {
      let errText = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body.error) errText = body.error;
      } catch (_) {}
      throw new Error(errText);
    }
    return await res.json();
  }

  // ─── Unread Badge & Polling ──────────────────────────────────────────

  async function refreshUnreadCount() {
    if (!getCachedGoogleToken()) {
      feedbackState.unreadCount = 0;
      updateSidebarBadge();
      return;
    }
    try {
      const data = await fetchApi("/api/feedback/unread");
      feedbackState.unreadCount = data.unreadCount || 0;
      feedbackState.isAdmin = Boolean(data.isAdmin);
      updateSidebarBadge();
    } catch (_) {}
  }

  function updateSidebarBadge() {
    const btns = document.querySelectorAll(".sidebar [data-action='feedback'], .sidebar [data-action='open-feedback']");
    btns.forEach((btn) => {
      let badge = btn.querySelector(".feedback-unread-badge");
      if (feedbackState.unreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "feedback-unread-badge";
          btn.appendChild(badge);
        }
        badge.innerText = feedbackState.unreadCount > 99 ? "99+" : String(feedbackState.unreadCount);
        badge.style.display = "inline-flex";
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function startUnreadPolling() {
    if (unreadCheckTimer) clearInterval(unreadCheckTimer);
    refreshUnreadCount();
    unreadCheckTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshUnreadCount();
      }
    }, 30000);
  }

  // ─── Data Loaders ────────────────────────────────────────────────────

  async function loadThreads() {
    if (!getCachedGoogleToken()) return;
    feedbackState.loading = true;
    renderHubIfVisible();
    try {
      const data = await fetchApi("/api/feedback/threads");
      feedbackState.threads = data.threads || [];
      feedbackState.unreadCount = data.unreadCount || 0;
      feedbackState.isAdmin = Boolean(data.isAdmin);
      updateSidebarBadge();
    } catch (err) {
      console.error("Failed to load feedback threads:", err);
    } finally {
      feedbackState.loading = false;
      renderHubIfVisible();
    }
  }

  async function selectThread(threadId) {
    feedbackState.activeThreadId = threadId;
    feedbackState.loading = true;
    renderHubIfVisible();
    try {
      const data = await fetchApi(`/api/feedback/threads/${encodeURIComponent(threadId)}`);
      feedbackState.activeThreadData = data;
      const threadInList = feedbackState.threads.find((t) => t.id === threadId);
      if (threadInList) {
        if (data.isAdmin) threadInList.admin_unread = 0;
        else threadInList.user_unread = 0;
      }
      refreshUnreadCount();
    } catch (err) {
      console.error("Failed to load thread:", err);
    } finally {
      feedbackState.loading = false;
      renderHubIfVisible();
      scrollChatToBottom();
    }
  }

  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      const container = document.getElementById("chat-messages-container");
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  function timeAgo(timestamp) {
    if (!timestamp) return "";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ─── Classical Glassmorphic Modal for "New Discussion" ───────────────

  function openNewDiscussionModal(defaultType = "Bug") {
    // Remove any existing feedback overlay
    const existing = document.querySelector(".feedback-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay feedback-overlay";
    const modal = document.createElement("div");
    modal.className = "feedback-dialog";

    const userEmail = (window.SevSync && window.SevSync.getStatus) ? window.SevSync.getStatus()?.email : "";
    const isLinked = Boolean(getCachedGoogleToken());
    let pendingAttachments = [];

    modal.innerHTML = `
      <div class="feedback-header">
        <div class="feedback-icon-wrapper">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        </div>
        <div class="feedback-title-group">
          <h3>Send Feedback</h3>
          <p>We'd love to hear your thoughts or bug reports.</p>
        </div>
        <button class="close-btn cancel-btn" type="button" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="feedback-body">
        <div class="feedback-form-group">
          <label>Feedback Type</label>
          <div class="feedback-type-selector">
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="Bug" ${defaultType === "Bug" ? "checked" : ""}>
              <div class="fb-radio-content">Bug</div>
            </label>
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="Feature" ${defaultType === "Feature" ? "checked" : ""}>
              <div class="fb-radio-content">Feature</div>
            </label>
            <label class="fb-radio-card">
              <input type="radio" name="fb-type" value="General" ${defaultType === "General" ? "checked" : ""}>
              <div class="fb-radio-content">General</div>
            </label>
          </div>
        </div>

        <div class="feedback-form-group">
          <label>Message</label>
          <textarea id="fb-msg" class="feedback-textarea" rows="4" placeholder="Tell us what you think..."></textarea>
        </div>

        <div class="feedback-form-row">
          ${
            userEmail
              ? ""
              : `
            <div class="feedback-form-group" style="flex:1; min-width: 0;">
              <label>Email <span class="muted">(Optional)</span></label>
              <input type="email" id="fb-email" class="feedback-input" placeholder="For follow-ups">
            </div>
          `
          }
          <div class="feedback-form-group" style="flex:1; min-width: 0;">
            <label>Screenshot <span class="muted">(WebP Compressed)</span></label>
            <div class="file-upload-wrapper">
              <input type="file" id="fb-file" accept="image/*" multiple class="file-upload-input">
              <div class="file-upload-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                <span id="fb-file-name">Attach Image</span>
              </div>
            </div>
          </div>
        </div>

        <div id="fb-error" role="alert" style="display: none; color: var(--red); font-size: 0.85em; margin-bottom: 8px;"></div>

        <button id="fb-submit" class="feedback-submit-btn">
          <span class="btn-text">Send Feedback</span>
          <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>

      <div class="feedback-status" style="display:none;">
        <div class="status-icon-wrapper">
          <svg id="fb-status-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h4 id="fb-status-title">Sent successfully!</h4>
        <p id="fb-status-msg" class="muted">Thank you for helping us improve.</p>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove("visible");
      modal.classList.remove("visible");
      setTimeout(() => overlay.remove(), 250);
    };

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      modal.classList.add("visible");
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    modal.querySelector(".cancel-btn").onclick = close;

    const fileInput = modal.querySelector("#fb-file");
    const fileNameDisplay = modal.querySelector("#fb-file-name");

    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 5) {
        alert("You can only attach up to 5 images.");
        fileInput.value = "";
        fileNameDisplay.innerText = "Attach Image";
        return;
      }

      pendingAttachments = [];
      for (const f of files) {
        try {
          const webp = await compressToWebP(f);
          pendingAttachments.push(webp);
        } catch (_) {}
      }

      if (files.length > 1) {
        fileNameDisplay.innerText = `${files.length} images (WebP)`;
      } else if (files.length === 1) {
        fileNameDisplay.innerText = `${files[0].name} (WebP)`;
      } else {
        fileNameDisplay.innerText = "Attach Image";
      }
    };

    modal.querySelector("#fb-submit").onclick = async () => {
      const type = modal.querySelector('input[name="fb-type"]:checked').value;
      const msg = modal.querySelector("#fb-msg").value.trim();
      const emailField = modal.querySelector("#fb-email");
      const email = emailField ? emailField.value.trim() : userEmail;

      if (!msg) {
        modal.querySelector("#fb-msg").focus();
        modal.querySelector("#fb-msg").style.borderColor = "var(--red)";
        return;
      }
      modal.querySelector("#fb-msg").style.borderColor = "";

      const errorLine = modal.querySelector("#fb-error");
      errorLine.style.display = "none";

      const submitBtn = modal.querySelector("#fb-submit");
      const btnText = submitBtn.querySelector(".btn-text");
      submitBtn.disabled = true;
      btnText.innerText = "Sending...";

      const fail = (text) => {
        errorLine.innerText = text;
        errorLine.style.display = "block";
        btnText.innerText = "Send Feedback";
        submitBtn.disabled = false;
      };

      try {
        if (isLinked) {
          // 2-Way D1 Endpoint
          const subject = msg.length > 50 ? msg.substring(0, 50) + "…" : msg;
          const data = await fetchApi("/api/feedback/threads", {
            method: "POST",
            body: JSON.stringify({
              subject,
              type,
              message: msg,
              attachments: pendingAttachments,
            }),
          });

          modal.querySelector(".feedback-body").style.display = "none";
          modal.querySelector(".feedback-status").style.display = "flex";

          setTimeout(async () => {
            close();
            await loadThreads();
            if (data.threadId) {
              await selectThread(data.threadId);
            }
            renderHubIfVisible();
          }, 1200);
        } else {
          // Anonymous relay fallback
          const formData = new FormData();
          formData.append("type", type);
          formData.append("message", msg);
          formData.append("email", email || "Not provided");
          formData.append(
            "context",
            JSON.stringify({
              urlHash: window.location.hash || "#feedback",
              userAgent: navigator.userAgent,
              viewport: `${window.innerWidth}x${window.innerHeight}`,
              version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "unknown",
            })
          );

          if (fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
              formData.append("file", fileInput.files[i]);
            }
          }

          const res = await fetch(SevApi.url("/api/feedback"), {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const body = await res.text();
            let detail = "";
            try { detail = String(JSON.parse(body).error || ""); } catch (_) {}
            fail(detail || `Request rejected (error ${res.status}).`);
            return;
          }

          modal.querySelector(".feedback-body").style.display = "none";
          modal.querySelector(".feedback-status").style.display = "flex";
          setTimeout(close, 1800);
        }
      } catch (err) {
        fail(err.message || "Couldn't send feedback. Please try again.");
      }
    };
  }

  // ─── Image Zoom Modal ────────────────────────────────────────────────

  function openImageZoom(dataUrl) {
    if (!dataUrl) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay image-preview-overlay";
    overlay.innerHTML = `
      <div class="image-preview-dialog">
        <button class="image-preview-close" type="button" aria-label="Close">✕</button>
        <img src="${dataUrl}" class="image-preview-full" alt="Full Screenshot">
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
    };

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
    });

    overlay.onclick = (e) => {
      if (e.target === overlay || e.target.classList.contains("image-preview-close") || e.target.closest(".image-preview-close")) {
        close();
      }
    };
  }

  // ─── Feedback Hub View (#feedback) ───────────────────────────────────

  function renderFeedbackView() {
    const isLinked = Boolean(getCachedGoogleToken());

    if (!isLinked) {
      return `
        <div class="feedback-empty-hero">
          <div class="feedback-hero-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </div>
          <h2 style="font-size:1.5rem; font-weight:700; margin:0 0 8px; color:var(--ink);">Feedback & Discussions</h2>
          <p class="hero-desc">Connect with the developer to report issues, request features, or ask SAT prep questions with 2-way replies directly inside Sevrony.</p>
          
          <div class="hero-features">
            <div class="feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Get direct replies from the developer in-app</span>
            </div>
            <div class="feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Attach auto-compressed WebP screenshots</span>
            </div>
            <div class="feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Track unresolved bugs and discussion status</span>
            </div>
          </div>

          <div class="hero-btn-group">
            <button type="button" class="btn btn-primary hero-signin-btn" data-action="link-drive">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              <span>Sign in with Google</span>
            </button>
            <button type="button" class="btn btn-outline" data-action="open-legacy-feedback">
              Send Anonymous Feedback
            </button>
          </div>
        </div>
      `;
    }

    const filteredThreads = feedbackState.threads.filter((t) => {
      if (feedbackState.filter === "open") return t.status === "open";
      if (feedbackState.filter === "resolved") return t.status === "resolved" || t.status === "closed";
      return true;
    });

    const activeThread = feedbackState.activeThreadData?.thread;
    const messages = feedbackState.activeThreadData?.messages || [];
    const hasActive = Boolean(activeThread);

    return `
      <div class="feedback-hub-view ${hasActive ? "in-chat" : ""}">
        <div class="feedback-hub-header">
          <div>
            <h2 class="feedback-hub-title">${feedbackState.isAdmin ? "Admin Feedback Hub" : "Feedback & Discussions"}</h2>
            <p class="feedback-hub-sub">${feedbackState.isAdmin ? "All user feedback threads & direct replies" : "Report bugs, request features, and track replies from developer"}</p>
          </div>
          <div>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-discussion" style="display:inline-flex; align-items:center; gap:6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>New Discussion</span>
            </button>
          </div>
        </div>

        <div class="feedback-hub-grid ${hasActive ? "has-active-thread" : ""}">
          <!-- Sidebar: Threads List -->
          <div class="feedback-threads-sidebar">
            <div class="threads-filter-bar">
              <button class="filter-tab ${feedbackState.filter === "all" ? "active" : ""}" data-filter="all">All (${feedbackState.threads.length})</button>
              <button class="filter-tab ${feedbackState.filter === "open" ? "active" : ""}" data-filter="open">Open</button>
              <button class="filter-tab ${feedbackState.filter === "resolved" ? "active" : ""}" data-filter="resolved">Resolved</button>
            </div>

            <div class="threads-list-scroll">
              ${
                feedbackState.loading && feedbackState.threads.length === 0
                  ? `<div style="text-align:center; padding:40px 16px; color:var(--ink-muted);">Loading discussions…</div>`
                  : filteredThreads.length === 0
                  ? `<div class="threads-empty-msg">No ${feedbackState.filter === "all" ? "" : feedbackState.filter} discussions found.</div>`
                  : filteredThreads
                      .map((t) => {
                        const isSelected = feedbackState.activeThreadId === t.id;
                        const isUnread = feedbackState.isAdmin ? t.admin_unread === 1 : t.user_unread === 1;
                        const typeClass = `type-badge-${(t.type || "general").toLowerCase().replace(/\s+/g, "-")}`;
                        return `
                        <div class="thread-item-card ${isSelected ? "selected" : ""} ${isUnread ? "unread" : ""}" data-thread-id="${escapeHtml(t.id)}">
                          <div class="thread-item-header">
                            <span class="thread-type-badge ${typeClass}">${escapeHtml(t.type || "General")}</span>
                            <span class="thread-time">${timeAgo(t.updated_at)}</span>
                          </div>
                          <div class="thread-item-subject-row">
                            ${isUnread ? '<span class="unread-dot" title="Unread"></span>' : ""}
                            <h4 class="thread-item-subject">${escapeHtml(t.subject)}</h4>
                          </div>
                          ${feedbackState.isAdmin ? `<div class="thread-user-email">User: ${escapeHtml(t.user_email)}</div>` : ""}
                          <p class="thread-item-snippet">${escapeHtml(t.last_message || "")}</p>
                          <div class="thread-item-footer">
                            <span class="thread-status-pill status-${t.status || "open"}">${escapeHtml(t.status || "open")}</span>
                            <span class="thread-msg-count">${t.message_count || 1} msg${(t.message_count || 1) > 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      `;
                      })
                      .join("")
              }
            </div>
          </div>

          <!-- Main: Active Thread Chat Pane -->
          <div class="feedback-chat-pane">
            ${
              !activeThread
                ? `
              <div class="no-thread-selected">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--ink-muted);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <h3>Select a discussion</h3>
                <p>Choose a thread on the left or create a new discussion.</p>
              </div>
            `
                : `
              <div class="chat-pane-inner">
                <!-- Chat Header -->
                <div class="chat-pane-header">
                  <button type="button" class="ghost-btn mobile-back-btn" data-action="mobile-back" aria-label="Back to discussions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back</span>
                  </button>
                  <div class="chat-header-main">
                    <div class="chat-title-row">
                      <span class="thread-type-badge type-badge-${(activeThread.type || "general").toLowerCase().replace(/\s+/g, "-")}">${escapeHtml(activeThread.type || "General")}</span>
                      <h3 class="chat-thread-title">${escapeHtml(activeThread.subject)}</h3>
                    </div>
                    <div class="chat-meta-row">
                      Started by <strong>${escapeHtml(activeThread.user_email)}</strong> • ${timeAgo(activeThread.created_at)}
                    </div>
                  </div>
                  <div class="chat-header-actions">
                    ${
                      feedbackState.isAdmin
                        ? `
                      <button type="button" class="btn btn-outline btn-sm status-toggle-btn" data-action="toggle-status" data-status="${activeThread.status}">
                        <span class="desktop-label">${activeThread.status === "resolved" ? "Reopen Discussion" : "Mark as Resolved"}</span>
                        <span class="mobile-label">${activeThread.status === "resolved" ? "Reopen" : "Resolve"}</span>
                      </button>
                    `
                        : `
                      <span class="thread-status-pill status-${activeThread.status || "open"}">
                        ${activeThread.status === "resolved" ? "✓ Resolved" : "● Open"}
                      </span>
                    `
                    }
                  </div>
                </div>

                <!-- Chat Messages -->
                <div class="chat-messages-container" id="chat-messages-container">
                  ${messages
                    .map((msg) => {
                      const isAdminMsg = msg.sender_role === "admin";
                      const isSelf = feedbackState.isAdmin ? isAdminMsg : !isAdminMsg;
                      const senderName = isAdminMsg ? "Team Sevrony" : isSelf ? "You" : escapeHtml(msg.sender_email);
                      return `
                      <div class="chat-message-row ${isSelf ? "self" : "other"} ${isAdminMsg ? "admin-message" : ""}">
                        <div class="chat-bubble">
                          <div class="chat-bubble-meta">
                            <strong>${senderName}</strong>
                            <span>${timeAgo(msg.created_at)}</span>
                          </div>
                          <div class="chat-bubble-body">${escapeHtml(msg.content)}</div>
                          ${
                            msg.attachments && msg.attachments.length > 0
                              ? `
                            <div class="message-attachments-grid">
                              ${msg.attachments
                                .map(
                                  (att) => `
                                <div class="message-attachment-card" data-full-src="${att.data}">
                                  <img src="${att.data}" alt="Screenshot" class="attached-img-thumb">
                                  <span class="zoom-indicator">🔍</span>
                                </div>
                              `
                                )
                                .join("")}
                            </div>
                          `
                              : ""
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
                </div>

                <!-- Chat Composer or Resolved Notice -->
                ${
                  activeThread.status === "resolved" || activeThread.status === "closed"
                    ? `
                  <div class="chat-resolved-notice-box">
                    <div class="resolved-notice-message">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="resolved-check-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      <div>
                        <div class="resolved-notice-title">This discussion has been marked as <strong>Resolved</strong>.</div>
                        <p class="resolved-notice-sub">${
                          feedbackState.isAdmin
                            ? "Replies are locked while resolved. Reopen the discussion to resume chatting."
                            : "Replies are closed. If you have another question or need help, please start a new discussion."
                        }</p>
                      </div>
                    </div>
                    <div class="resolved-notice-actions">
                      ${
                        feedbackState.isAdmin
                          ? `
                        <button type="button" class="btn btn-outline btn-sm" data-action="toggle-status" data-status="${activeThread.status}">
                          Reopen Discussion
                        </button>
                      `
                          : `
                        <button type="button" class="btn btn-primary btn-sm" data-action="new-discussion">
                          Start New Discussion
                        </button>
                      `
                      }
                    </div>
                  </div>
                `
                    : `
                  <!-- Pending Attachments Strip -->
                  ${
                    feedbackState.pendingAttachments.length > 0
                      ? `
                    <div class="pending-attachments-bar">
                      ${feedbackState.pendingAttachments
                        .map(
                          (att, idx) => `
                        <div class="attachment-preview-chip">
                          <img src="${att.data}" class="preview-thumb" alt="Attachment preview">
                          <span>${escapeHtml(att.name)}</span>
                          <button type="button" class="remove-att-btn" data-remove-idx="${idx}">×</button>
                        </div>
                      `
                        )
                        .join("")}
                    </div>
                  `
                      : ""
                  }

                  <!-- Chat Composer -->
                  <div class="chat-composer-box">
                    <div class="composer-input-wrapper">
                      <textarea id="feedback-reply-textarea" class="chat-textarea" placeholder="Write a reply…" rows="2"></textarea>
                      <div class="composer-toolbar">
                        <label class="attach-btn-label" title="Attach Image (WebP)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                          <span class="attach-label-text">Attach Image</span>
                          <input type="file" id="feedback-reply-file" accept="image/*" multiple style="display:none;">
                        </label>
                        <button type="button" id="feedback-send-reply-btn" class="btn btn-primary btn-sm" ${feedbackState.sending ? "disabled" : ""}>
                          ${feedbackState.sending ? "Sending…" : "Send Reply"}
                        </button>
                      </div>
                    </div>
                  </div>
                `
                }
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;
  }

  function bindFeedbackEvents() {
    const root = document.querySelector(".feedback-hub-view, .feedback-empty-hero");
    if (!root) return;

    // Filter tabs
    root.querySelectorAll(".filter-tab[data-filter]").forEach((tab) => {
      tab.onclick = () => {
        feedbackState.filter = tab.dataset.filter;
        renderHubIfVisible();
      };
    });

    // Select thread
    root.querySelectorAll(".thread-item-card[data-thread-id]").forEach((card) => {
      card.onclick = () => {
        selectThread(card.dataset.threadId);
      };
    });

    // New discussion button
    root.querySelectorAll("[data-action='new-discussion']").forEach((newBtn) => {
      newBtn.onclick = () => openNewDiscussionModal("Bug");
    });

    // Anonymous legacy feedback button
    root.querySelectorAll("[data-action='open-legacy-feedback']").forEach((legacyBtn) => {
      legacyBtn.onclick = () => openNewDiscussionModal("Bug");
    });

    // Mobile back
    root.querySelectorAll("[data-action='mobile-back']").forEach((mobileBack) => {
      mobileBack.onclick = () => {
        feedbackState.activeThreadId = null;
        feedbackState.activeThreadData = null;
        renderHubIfVisible();
      };
    });

    // Toggle status (Admin only)
    root.querySelectorAll("[data-action='toggle-status']").forEach((statusBtn) => {
      if (feedbackState.activeThreadId) {
        statusBtn.onclick = async () => {
          const current = statusBtn.dataset.status;
          const next = current === "resolved" || current === "closed" ? "open" : "resolved";
          try {
            await fetchApi(`/api/feedback/threads/${encodeURIComponent(feedbackState.activeThreadId)}`, {
              method: "PATCH",
              body: JSON.stringify({ status: next }),
            });
            await loadThreads();
            await selectThread(feedbackState.activeThreadId);
          } catch (e) {
            alert(`Could not update status: ${e.message}`);
          }
        };
      }
    });

    // Reply file attach
    const replyFile = root.querySelector("#feedback-reply-file");
    if (replyFile) {
      replyFile.onchange = async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          if (feedbackState.pendingAttachments.length >= 5) break;
          try {
            const webp = await compressToWebP(file);
            feedbackState.pendingAttachments.push(webp);
          } catch (_) {}
        }
        renderHubIfVisible();
      };
    }

    // Remove pending attachment
    root.querySelectorAll(".remove-att-btn[data-remove-idx]").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.removeIdx, 10);
        feedbackState.pendingAttachments.splice(idx, 1);
        renderHubIfVisible();
      };
    });

    // Zoom image
    root.querySelectorAll(".message-attachment-card[data-full-src]").forEach((card) => {
      card.onclick = () => openImageZoom(card.dataset.fullSrc);
    });

    // Send reply
    const sendReplyBtn = root.querySelector("#feedback-send-reply-btn");
    const replyTextarea = root.querySelector("#feedback-reply-textarea");

    if (sendReplyBtn && replyTextarea && feedbackState.activeThreadId) {
      // Paste screenshot directly into composer
      replyTextarea.onpaste = async (e) => {
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            if (file && feedbackState.pendingAttachments.length < 5) {
              const webp = await compressToWebP(file);
              feedbackState.pendingAttachments.push(webp);
              renderHubIfVisible();
            }
          }
        }
      };

      // Keyboard shortcut (Cmd+Enter / Ctrl+Enter)
      replyTextarea.onkeydown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          sendReplyBtn.click();
        }
      };

      sendReplyBtn.onclick = async () => {
        const message = replyTextarea.value.trim();
        if (!message && feedbackState.pendingAttachments.length === 0) return;

        feedbackState.sending = true;
        sendReplyBtn.disabled = true;

        try {
          await fetchApi(`/api/feedback/threads/${encodeURIComponent(feedbackState.activeThreadId)}/messages`, {
            method: "POST",
            body: JSON.stringify({
              message: message || "(Image Attachment)",
              attachments: feedbackState.pendingAttachments,
            }),
          });
          feedbackState.pendingAttachments = [];
          if (replyTextarea) replyTextarea.value = "";
        } catch (err) {
          alert(`Failed to send reply: ${err.message}`);
        } finally {
          feedbackState.sending = false;
          await selectThread(feedbackState.activeThreadId);
        }
      };
    }
  }

  function renderHubIfVisible() {
    const mainGrid = document.querySelector(".main-grid");
    if (mainGrid && window.location.hash === "#feedback") {
      mainGrid.innerHTML = renderFeedbackView();
      bindFeedbackEvents();
    }
  }

  // ─── Module Export ───────────────────────────────────────────────────

  window.SevFeedback = {
    init: () => {
      startUnreadPolling();
      if (getCachedGoogleToken()) {
        loadThreads();
      }
    },
    refreshUnreadCount,
    loadThreads,
    renderFeedbackView,
    bindEvents: bindFeedbackEvents,
    openNewModal: openNewDiscussionModal,
    showModal: openNewDiscussionModal,
    getState: () => feedbackState,
  };
})();
