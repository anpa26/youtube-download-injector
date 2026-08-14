/*
    youtube-download-injector - A browser extension to detect and download YouTube videos, audio, and subtitles.
    Copyright (C) 2026 anpa26

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/


if (typeof importScripts !== 'undefined') {
  importScripts(
    "libraries/lame.min.js",
    "libraries/libav.js",
    "libraries/wymd.js"
  );
}

const DB_NAME = 'YTD_DownloadsDB';
const DB_VERSION = 4;
const STORE_DOWNLOADS = 'downloads';
const STORE_CHUNKS = 'download-chunks';
const STORE_HISTORY = 'history';
const STORE_LOGS = 'logs';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_DOWNLOADS)) {
        db.createObjectStore(STORE_DOWNLOADS, { keyPath: 'taskId' });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.createObjectStore(STORE_CHUNKS, { keyPath: ['taskId', 'chunkIndex'] });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

let activeDownloads = {};
let downloadQueue = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    logToPopup(`Direct download triggered: ${message.filename}`);
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        logToPopup(`Direct download failed: ${chrome.runtime.lastError.message}`);
        chrome.tabs.create({ url: message.url });
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        logToPopup(`Direct download started. ID: ${downloadId}`);
        addToHistory({
          title: message.filename,
          thumbnail: message.thumbnail || 'icons/icon.svg',
          filename: message.filename,
          time: Date.now(),
          status: 'success'
        });
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    return true;
  } else if (message.action === 'extract_streams') {
    const extractor = new YoutubeMultiTrack({ useCookies: true });
    logToPopup(`Extracting streams for video ID: ${message.videoId}`);
    extractor.extractAllStreams(message.videoId)
      .then(data => {
        logToPopup(`Successfully extracted streams`);
        sendResponse({ success: true, data });
      })
      .catch(err => {
        logToPopup(`Extraction failed: ${err.message}`);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (message.action === 'get_active_downloads') {
    sendResponse({ activeDownloads });
    return true;
  } else if (message.action === 'cancel_download') {
    logToPopup(`Cancellation request for Task: ${message.taskId}`);

    chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'cancel_active_fetch', taskId: message.taskId }).catch(() => {});
      });
    });

    const task = activeDownloads[message.taskId];
    if (task) {
      addToHistory({
        title: task.title,
        thumbnail: task.thumbnail,
        filename: task.title,
        time: Date.now(),
        status: 'failed'
      });
      delete activeDownloads[message.taskId];
      broadcastActiveDownloads();
    }
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'update_progress_broadcast') {
    const { taskId, progress, status, title, thumbnail } = message;
    activeDownloads[taskId] = {
      title: title || (activeDownloads[taskId] ? activeDownloads[taskId].title : 'download'),
      thumbnail: thumbnail || (activeDownloads[taskId] ? activeDownloads[taskId].thumbnail : 'icons/icon.svg'),
      progress: progress,
      status: status || 'downloading'
    };
    broadcastActiveDownloads();
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'remove_active_download') {
    const { taskId, status, filename, thumbnail } = message;
    logToPopup(`Task ${taskId} completed with status: ${status}`);
    delete activeDownloads[taskId];
    broadcastActiveDownloads();
    
    addToHistory({
      title: filename,
      thumbnail: thumbnail || 'icons/icon.svg',
      filename: filename,
      time: Date.now(),
      status: status || 'success'
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'log_from_content') {
    logToPopup(message.text);
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'trigger_downloads_api') {
    try {
      const item = {
        arrayBuffer: message.arrayBuffer,
        filename: message.filename,
        taskId: message.taskId,
        thumbnail: message.thumbnail
      };
      downloadQueue.push(item);

      const isAndroid = /Android/i.test(navigator.userAgent);
      const isFirefox = typeof chrome.offscreen === 'undefined';

      if (isAndroid || isFirefox) {
        ensureDownloadTab(sendResponse);
      } else {
        logToPopup(`Creating/ensuring offscreen document...`);
        setupOffscreenDocument('offscreen/offscreen.html', 'AUDIO_PLAYBACK', 'Decode and encode MP3 audio offline without opening tabs')
          .then(() => {
            chrome.runtime.sendMessage({ action: 'new_download_queued' }).catch(() => {});
            sendResponse({ success: true, offscreen: true });
          })
          .catch((err) => {
            console.error("Offscreen creation failed:", err);
            ensureDownloadTab(sendResponse);
          });
      }
    } catch (err) {
      logToPopup("trigger_downloads_api error: " + err.message);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  } else if (message.action === 'trigger_offscreen_save') {
    const { taskId, filename } = message;
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (typeof chrome.offscreen !== 'undefined' && !isAndroid) {
      setupOffscreenDocument('offscreen/offscreen.html', 'DOWNLOAD', 'Trigger download for finished task')
        .then(async () => {
          const response = await chrome.runtime.sendMessage({
            action: 'triggerOffscreenDownload',
            data: { taskId, filename }
          }).catch(e => ({ success: false, error: e.message }));
          
          await closeOffscreenDocument().catch(() => {});
          sendResponse(response || { success: true });
        })
        .catch(err => {
          console.error("Offscreen save failed:", err);
          sendResponse({ success: false, error: err.message });
        });
    } else {
      sendResponse({ success: false, error: "Offscreen not supported or on mobile" });
    }
    return true;
  } else if (message.action === 'pop_download_queue') {
    const item = downloadQueue.shift();
    sendResponse(item || null);
    return true;
  } else if (message.action === 'offscreen_download_complete') {
    closeOffscreenDocument().catch(() => {});
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'probe_range') {
    fetch(message.url, { method: 'HEAD' })
      .then(headResp => {
        const totalSize = headResp.headers.get('Content-Length');
        return fetch(message.url, { headers: { 'Range': 'bytes=0-0' } })
          .then(rangeResp => {
            const isChunked = rangeResp.status === 206;
            const contentRange = rangeResp.headers.get('Content-Range');
            sendResponse({
              success: true,
              isChunked,
              contentRange,
              totalSize: totalSize ? parseInt(totalSize, 10) : null
            });
          });
      })
      .catch(() => {
        fetch(message.url, { headers: { 'Range': 'bytes=0-0' } })
          .then(resp => {
            const isChunked = resp.status === 206;
            const contentRange = resp.headers.get('Content-Range');
            sendResponse({ success: true, isChunked, contentRange });
          })
          .catch(err => {
            sendResponse({ success: false, error: err.message });
          });
      });
    return true;
  } else if (message.action === 'fetch_chunk') {
    fetch(message.url, { headers: { 'Range': `bytes=${message.start}-${message.end}` } })
      .then(resp => {
        if (!resp.ok && resp.status !== 206) {
          throw new Error(`HTTP status ${resp.status}`);
        }
        return resp.arrayBuffer();
      })
      .then(buf => {
        sendResponse({ success: true, arrayBuffer: buf });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (message.action === 'fetch_linear') {
    fetch(message.url)
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP status ${resp.status}`);
        return resp.arrayBuffer();
      })
      .then(buf => {
        sendResponse({ success: true, arrayBuffer: buf });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (message.action === 'get_history_db') {
    dbGetHistory().then(sendResponse);
    return true;
  } else if (message.action === 'get_logs_db') {
    dbGetLogs().then(sendResponse);
    return true;
  } else if (message.action === 'clear_all_db') {
    Promise.all([dbClearHistory(), dbClearLogs()]).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

function broadcastActiveDownloads() {
  chrome.runtime.sendMessage({ action: 'progress_update', activeDownloads }).catch(() => {});
}

async function dbAddHistory(item) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    store.add({
      title: item.title,
      thumbnail: item.thumbnail,
      filename: item.filename,
      time: item.time || Date.now(),
      status: item.status
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        chrome.runtime.sendMessage({ action: 'history_updated' }).catch(() => {});
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("DB history error:", e);
  }
}

async function dbGetHistory() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const res = request.result;
        res.sort((a, b) => b.time - a.time);
        resolve(res.slice(0, 50));
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    console.error("DB history load error:", e);
    return [];
  }
}

async function dbClearHistory() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    store.clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        chrome.runtime.sendMessage({ action: 'history_updated' }).catch(() => {});
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("DB history clear error:", e);
  }
}

async function dbGetLogs() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LOGS, 'readonly');
    const store = tx.objectStore(STORE_LOGS);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const res = request.result;
        res.sort((a, b) => a.time - b.time);
        resolve(res.slice(-150));
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    console.error("DB load logs error:", e);
    return [];
  }
}

async function dbClearLogs() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LOGS, 'readwrite');
    const store = tx.objectStore(STORE_LOGS);
    store.clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("DB clear logs error:", e);
  }
}

function logToPopup(text) {
  
}

async function addToHistory(item) {
  await dbAddHistory(item);
}

async function triggerDirectDownload(item) {
  try {
    const { arrayBuffer, filename, taskId, thumbnail } = item;
    if (!arrayBuffer) return false;

    const isMp3 = filename.toLowerCase().endsWith('.mp3');
    const isM4a = filename.toLowerCase().endsWith('.m4a');
    const isWebm = filename.toLowerCase().endsWith('.webm');

    let mimeType = 'video/mp4';
    if (isMp3) mimeType = 'audio/mp3';
    else if (isM4a) mimeType = 'audio/x-m4a';
    else if (isWebm) mimeType = 'audio/webm';

    const blob = new Blob([arrayBuffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    console.log("[triggerDirectDownload] Triggering Firefox direct download:", filename, "size:", blob.size);

    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: false
      });

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 30000);

      if (taskId) {
        addToHistory({
          title: filename,
          thumbnail: thumbnail || 'icons/icon.svg',
          filename: filename,
          time: Date.now(),
          status: 'success'
        });
      }

      return true;
    } catch (e) {
      URL.revokeObjectURL(blobUrl);
      console.error("[triggerDirectDownload] Download failed:", e);
      return false;
    }
  } catch (e) {
    console.error("[triggerDirectDownload] Error:", e);
    return false;
  }
}

async function hasOffscreenDocument(url) {
  if (typeof chrome.offscreen !== 'undefined' && typeof chrome.offscreen.hasDocument === 'function') {
    return await chrome.offscreen.hasDocument();
  }
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
  } else {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      if (client.url.includes(url)) {
        return true;
      }
    }
    return false;
  }
}

async function setupOffscreenDocument(url, reason = 'AUDIO_PLAYBACK', justification = 'Decode and encode MP3 audio offline without opening tabs') {
  try {
    const hasDoc = await hasOffscreenDocument(url);
    if (hasDoc) return;
    await chrome.offscreen.createDocument({
      url: url,
      reasons: [reason],
      justification: justification
    });
  } catch (err) {
    if (err.message && err.message.includes('Only one offscreen document')) {
      try {
        await chrome.offscreen.closeDocument();
      } catch (e) {}
      await chrome.offscreen.createDocument({
        url: url,
        reasons: [reason],
        justification: justification
      });
    } else {
      console.error("Failed to create offscreen document:", err);
      throw err;
    }
  }
}

async function closeOffscreenDocument() {
  if (typeof chrome.offscreen !== 'undefined' && typeof chrome.offscreen.hasDocument === 'function') {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      await chrome.offscreen.closeDocument();
    }
  } else {
    
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {}
  }
}

function ensureDownloadTab(sendResponse) {
  const url = chrome.runtime.getURL('download.html');
  chrome.tabs.query({ url: url + '*' }, (tabs) => {
    const existingTab = tabs && tabs.find(t => !t.url.includes('offscreen=true'));
    if (existingTab) {
      logToPopup(`Download tab already exists. Focusing tab ID: ${existingTab.id}`);
      chrome.tabs.update(existingTab.id, { active: true }, () => {
        chrome.tabs.sendMessage(existingTab.id, { action: 'new_download_queued' }).catch(() => {});
        if (sendResponse) sendResponse({ success: true, tabId: existingTab.id });
      });
    } else {
      logToPopup(`Opening new download.html tab...`);
      chrome.tabs.create({ url, active: true }, (tab) => {
        if (sendResponse) sendResponse({ success: true, tabId: tab.id });
      });
    }
  });
}


chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://ydi.devianproject.tech/' });
  }
});
