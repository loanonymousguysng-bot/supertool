// ==UserScript==
// @name         School AI Draft Helper
// @namespace    local.school-ai-draft-helper
// @version      1.0.1
// @description  Tạo nháp trả lời, không tự bấm gửi; dừng câu sau 2 phản hồi sai.
// @match        https://fsc-edunext.fpt.edu.vn/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(() => {
  "use strict";

  const API = "http://127.0.0.1:3030/draft";
  const STORE = "school-ai-draft-helper:v1";
  const WRONG = [
    "chưa chính xác",
    "chưa hoàn toàn chính xác",
    "không chính xác",
    "không đúng",
    "trả lời sai",
    "hãy thử lại",
    "thử lại"
  ];
  const QUESTION_MARKERS = [
    "bạn hãy làm bài",
    "trả lời:",
    "câu hỏi",
    "bao nhiêu",
    "hãy cho biết",
    "hãy trình bày",
    "hãy giải thích" ,
    "question",
    "exercise",
    "challange"
  ];

  const state = loadState();
  let currentHash = null;
  let busy = false;
  let lastObservedText = "";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || { questions: {} };
    } catch {
      return { questions: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORE, JSON.stringify(state));
  }

  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(16);
  }

  function cleanText(text) {
    return text
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, " ")
      .replace(/\b[0-9a-f]{24,}\b/gi, " ")
      .replace(/\b\d{1,2}:\d{2}:\d{2}\s+\d{1,2}\/\d{1,2}\/\d{4}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function assistantMessages() {
    return [...document.querySelectorAll(".message-assistant")]
      .filter((el) => el.innerText?.trim());
  }

  function latestAssistant() {
    return assistantMessages().at(-1) || null;
  }

  function looksLikeQuestion(text) {
    const lower = text.toLowerCase();
    return QUESTION_MARKERS.some((marker) => lower.includes(marker));
  }

  function questionRecord(question) {
    const key = hash(question);
    state.questions[key] ||= { question, wrongCount: 0, stopped: false, drafts: [] };
    return { key, record: state.questions[key] };
  }

  function nativeSetTextarea(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();
  }

  function postJson(url, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(body),
        timeout: 120000,
        onload(response) {
          let data;
          try {
            data = JSON.parse(response.responseText);
          } catch {
            reject(new Error(`server trả dữ liệu không hợp lệ (${response.status})`));
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(data.error || `server trả lỗi ${response.status}`));
            return;
          }
          resolve(data);
        },
        onerror() {
          reject(new Error("không kết nối được server local"));
        },
        ontimeout() {
          reject(new Error("server phản hồi quá lâu"));
        }
      });
    });
  }

  async function imageToDataUrl(message) {
    const candidates = [...message.querySelectorAll("img")]
      .filter((img) => img.naturalWidth >= 120 && img.naturalHeight >= 100)
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
    const img = candidates[0];
    if (!img?.src) return null;

    try {
      const response = await fetch(img.src, { credentials: "include" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.78);
    } catch {
      return null;
    }
  }

  function setStatus(text, tone = "normal") {
    const status = document.querySelector("#sadh-status");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function updateCounter() {
    const el = document.querySelector("#sadh-counter");
    if (!el) return;
    const record = currentHash ? state.questions[currentHash] : null;
    el.textContent = `sai: ${record?.wrongCount || 0}/2`;
  }

  function observeFeedback() {
    const message = latestAssistant();
    if (!message) return;
    const text = cleanText(message.innerText);
    if (!text || text === lastObservedText) return;
    lastObservedText = text;

    const lower = text.toLowerCase();
    if (currentHash && WRONG.some((marker) => lower.includes(marker))) {
      const record = state.questions[currentHash];
      if (record && !record.lastWrongFeedback?.includes(text)) {
        record.wrongCount += 1;
        record.lastWrongFeedback = text;
        if (record.wrongCount >= 2) {
          record.stopped = true;
          setStatus("đã dừng: câu này sai 2 lần", "error");
        } else {
          setStatus("phản hồi sai lần 1; hãy kiểm tra trước khi thử lại", "warn");
        }
        saveState();
        updateCounter();
      }
    }
  }

  async function createDraft() {
    if (busy) return;
    const message = latestAssistant();
    const textarea = document.querySelector("textarea.w-md-editor-text-input");
    if (!message || !textarea) {
      setStatus("không tìm thấy câu hỏi hoặc ô nhập", "error");
      return;
    }

    const question = cleanText(message.innerText);
    if (!looksLikeQuestion(question)) {
      setStatus("tin nhắn cuối chưa giống một câu hỏi", "warn");
      return;
    }

    const { key, record } = questionRecord(question);
    currentHash = key;
    updateCounter();
    if (record.stopped || record.wrongCount >= 2) {
      setStatus("đã dừng: câu này sai 2 lần", "error");
      return;
    }

    busy = true;
    setStatus("đang tạo nháp…");
    try {
      if (record.drafts.length && record.wrongCount === 0) {
        nativeSetTextarea(textarea, record.drafts.at(-1));
        setStatus("đã điền nháp từ bộ nhớ; m tự kiểm tra rồi bấm gửi", "ok");
        return;
      }

      const image = await imageToDataUrl(message);
      const data = await postJson(API, { question, image });

      const answer = String(data.answer || "").trim();
      if (!answer) throw new Error("nháp rỗng");
      record.drafts.push(answer);
      record.lastUsage = data.usage || null;
      saveState();
      nativeSetTextarea(textarea, answer);
      setStatus(
        data.needs_review
          ? "ảnh/dữ kiện chưa chắc; kiểm tra kỹ trước khi gửi"
          : "đã điền nháp; m tự kiểm tra rồi bấm gửi",
        data.needs_review ? "warn" : "ok"
      );
    } catch (error) {
      setStatus(`lỗi: ${error.message}`, "error");
    } finally {
      busy = false;
    }
  }

  function mountPanel() {
    if (document.querySelector("#sadh-panel")) return;
    const panel = document.createElement("div");
    panel.id = "sadh-panel";
    panel.innerHTML = `
      <div class="sadh-title">AI draft</div>
      <button id="sadh-draft" type="button">tạo nháp</button>
      <span id="sadh-counter">sai: 0/2</span>
      <div id="sadh-status">sẵn sàng</div>
    `;
    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      #sadh-panel{position:fixed;left:12px;bottom:12px;z-index:2147483647;width:220px;padding:10px;border:1px solid #cfd5df;border-radius:10px;background:#fff;color:#172033;box-shadow:0 5px 20px #0002;font:13px system-ui,sans-serif}
      #sadh-panel .sadh-title{font-weight:700;margin-bottom:8px}
      #sadh-draft{border:0;border-radius:7px;padding:7px 11px;background:#2864dc;color:#fff;cursor:pointer;font-weight:600}
      #sadh-counter{margin-left:8px;color:#667085}
      #sadh-status{margin-top:8px;line-height:1.35;color:#475467}
      #sadh-status[data-tone="ok"]{color:#067647}
      #sadh-status[data-tone="warn"]{color:#b54708}
      #sadh-status[data-tone="error"]{color:#b42318}
    `;
    document.head.appendChild(style);
    document.querySelector("#sadh-draft").addEventListener("click", createDraft);
  }

  mountPanel();
  const observer = new MutationObserver(observeFeedback);
  observer.observe(document.body, { childList: true, subtree: true });
  observeFeedback();
})();
