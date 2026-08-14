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

document.addEventListener('DOMContentLoaded', () => {
  const downloadsListEl = document.getElementById('downloads-list');
  const emptyStateEl = document.getElementById('empty-state');
  const listHeaderEl = document.getElementById('list-header');

  const previewDialog = document.getElementById('preview-dialog');
  const previewTitle = document.getElementById('preview-title');
  const previewContent = document.getElementById('preview-content');
  const closePreviewBtn = document.getElementById('close-preview-btn');

  if (closePreviewBtn) {
    closePreviewBtn.addEventListener('click', () => {
      if (previewDialog) previewDialog.open = false;
      if (previewContent) previewContent.innerHTML = '';
    });
  }

  
  chrome.storage.local.get(['theme', 'pitchBlack'], (res) => {
    const theme = res.theme || 'light';
    const isPitch = theme === 'pitch-black' || res.pitchBlack === true;
    document.documentElement.classList.remove('mdui-theme-auto', 'mdui-theme-dark', 'mdui-theme-light', 'theme-pitch-black');
    if (theme === 'dark' || theme === 'pitch-black') {
      document.documentElement.classList.add('mdui-theme-dark');
      if (isPitch) {
        document.documentElement.classList.add('theme-pitch-black');
      }
    } else {
      document.documentElement.classList.add('mdui-theme-light');
    }
  });

  
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.theme) {
        const themeVal = changes.theme.newValue || 'light';
        const isPitch = themeVal === 'pitch-black';
        document.documentElement.classList.remove('mdui-theme-auto', 'mdui-theme-dark', 'mdui-theme-light', 'theme-pitch-black');
        if (themeVal === 'dark' || themeVal === 'pitch-black') {
          document.documentElement.classList.add('mdui-theme-dark');
          if (isPitch) {
            document.documentElement.classList.add('theme-pitch-black');
          }
        } else {
          document.documentElement.classList.add('mdui-theme-light');
        }
      }
    });
  }

  function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.textContent = message;
      }
    });
  }
  applyLanguage();

  const DB_NAME = 'YTD_DownloadsDB';
  const DB_VERSION = 4;
  const STORE_NAME = 'downloads';
  const CHUNK_STORE_NAME = 'download-chunks';
  const STORAGE_KEY = 'ytd_manager_downloads';
  const CHUNK_SIZE = 4 * 1024 * 1024; 

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'taskId' });
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
          db.createObjectStore(CHUNK_STORE_NAME, { keyPath: ['taskId', 'chunkIndex'] });
        }
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('logs')) {
          db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  
  async function getStoredDownloads() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        resolve(res[STORAGE_KEY] || []);
      });
    });
  }

  async function saveStoredDownloads(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve);
    });
  }

  async function addStoredDownload(meta) {
    const list = await getStoredDownloads();
    const idx = list.findIndex(i => i.taskId === meta.taskId);
    if (idx === -1) list.push(meta);
    else list[idx] = meta;
    await saveStoredDownloads(list);
  }

  async function removeStoredDownload(taskId) {
    const list = await getStoredDownloads();
    await saveStoredDownloads(list.filter(i => i.taskId !== taskId));
  }

  
  

  async function saveChunksToDB(taskId, arrayBuffer, mimeType) {
    try {
      const db = await openDB();
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

      
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ taskId, mimeType, totalChunks });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });

      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
        const chunk = arrayBuffer.slice(start, end);
        await new Promise((resolve, reject) => {
          const tx = db.transaction(CHUNK_STORE_NAME, 'readwrite');
          tx.objectStore(CHUNK_STORE_NAME).put({ taskId, chunkIndex: i, data: chunk });
          tx.oncomplete = () => resolve();
          tx.onerror = (e) => { console.error('IDB chunk write error:', e.target.error); resolve(); };
        });
      }
    } catch (e) {
      console.error('IDB saveChunks error:', e);
    }
  }

  async function loadBlobFromDB(taskId) {
    try {
      const db = await openDB();

      
      const meta = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(taskId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (!meta) return null;

      
      const chunks = [];
      await new Promise((resolve) => {
        const tx = db.transaction(CHUNK_STORE_NAME, 'readonly');
        const range = IDBKeyRange.bound([taskId, 0], [taskId, Infinity]);
        const cursor = tx.objectStore(CHUNK_STORE_NAME).openCursor(range);
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c) {
            chunks.push({ index: c.value.chunkIndex, data: c.value.data });
            c.continue();
          } else {
            resolve();
          }
        };
        cursor.onerror = () => resolve();
      });

      if (chunks.length === 0) return null;
      chunks.sort((a, b) => a.index - b.index);
      return new Blob(chunks.map(c => c.data), { type: meta.mimeType || 'application/octet-stream' });
    } catch (e) {
      console.error('IDB loadBlob error:', e);
      return null;
    }
  }

  async function deleteChunksFromDB(taskId) {
    try {
      const db = await openDB();
      
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(taskId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      
      await new Promise((resolve) => {
        const tx = db.transaction(CHUNK_STORE_NAME, 'readwrite');
        const range = IDBKeyRange.bound([taskId, 0], [taskId, Infinity]);
        const cursor = tx.objectStore(CHUNK_STORE_NAME).openCursor(range);
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); }
          else resolve();
        };
        cursor.onerror = () => resolve();
      });
    } catch (e) {
      console.error('IDB deleteChunks error:', e);
    }
  }

  
  async function deleteLocalTask(taskId) {
    await removeStoredDownload(taskId);
    await deleteChunksFromDB(taskId);
  }

  
  async function persistTask(taskId, arrayBuffer, mimeType, meta) {
    await saveChunksToDB(taskId, arrayBuffer, mimeType);
    await addStoredDownload({ taskId, ...meta });
  }

  let localTasks = {};

  
  (async () => {
    const stored = await getStoredDownloads();
    for (const meta of stored) {
      const blob = await loadBlobFromDB(meta.taskId);
      let url = null;
      if (blob) {
        try { url = URL.createObjectURL(blob); } catch (e) {}
      }
      localTasks[meta.taskId] = {
        taskId: meta.taskId,
        title: meta.title,
        thumbnail: meta.thumbnail,
        blob,
        url,
        status: blob ? (meta.status || 'ready') : 'failed',
        progress: meta.progress || 100
      };
    }
    refreshUI();
  })();

  
  function refreshUI() {
    chrome.runtime.sendMessage({ action: 'get_active_downloads' }, (res) => {
      const activeDownloads = (res && res.activeDownloads) ? res.activeDownloads : {};
      updateUI(activeDownloads);
    });
  }

  function updateUI(activeDownloads) {
    if (!downloadsListEl) return;
    
    
    const allTasks = { ...localTasks };
    
    Object.keys(activeDownloads).forEach(taskId => {
      
      if (!allTasks[taskId] || allTasks[taskId].status !== 'ready') {
        allTasks[taskId] = {
          title: activeDownloads[taskId].title,
          thumbnail: activeDownloads[taskId].thumbnail,
          progress: activeDownloads[taskId].progress,
          status: activeDownloads[taskId].status
        };
      }
    });

    const taskIds = Object.keys(allTasks);
    
    if (taskIds.length === 0) {
      emptyStateEl.style.display = 'flex';
      downloadsListEl.style.display = 'none';
      listHeaderEl.style.display = 'none';
      return;
    }
    
    emptyStateEl.style.display = 'none';
    downloadsListEl.style.display = 'flex';
    listHeaderEl.style.display = 'flex';
    listHeaderEl.innerHTML = '';

    
    const clearAllBtn = document.createElement('mdui-button');
    clearAllBtn.setAttribute('variant', 'text');
    clearAllBtn.style.cssText = 'color: rgb(var(--mdui-color-error)); margin-left: auto;';
    clearAllBtn.textContent = chrome.i18n.getMessage('ui_clear_all') || 'Clear All';
    clearAllBtn.addEventListener('click', async () => {
      const confirmClear = confirm(chrome.i18n.getMessage('btn_clear_history') + '?');
      if (!confirmClear) return;
      clearAllBtn.disabled = true;
      const ids = Object.keys(localTasks);
      for (const id of ids) {
        if (localTasks[id].url) URL.revokeObjectURL(localTasks[id].url);
        await deleteLocalTask(id);
      }
      localTasks = {};
      refreshUI();
    });
    listHeaderEl.appendChild(clearAllBtn);

    // Remove cards for deleted tasks
    const existingCards = downloadsListEl.querySelectorAll('.download-card');
    existingCards.forEach(c => {
      const tid = c.getAttribute('data-task-id');
      if (!taskIds.includes(tid)) {
        c.remove();
      }
    });

    taskIds.forEach(taskId => {
      const task = allTasks[taskId];
      const isAudioType = task.title.toLowerCase().endsWith('.mp3') || task.title.toLowerCase().endsWith('.m4a') || task.title.toLowerCase().includes('audio');
      
      let statusText = chrome.i18n.getMessage('status_processing') || 'Processing...';
      const isReady = task.status === 'ready';
      const isFailed = task.status === 'failed';
      const isPending = !isReady && !isFailed;
      
      if (task.status === 'downloading') {
        statusText = (chrome.i18n.getMessage('status_downloading') || 'Downloading...').replace('...', ` ${task.progress}%`);
      } else if (task.status === 'muxing') {
        statusText = chrome.i18n.getMessage('status_muxing') || 'Muxing audio and video streams...';
      } else if (task.status === 'converting') {
        statusText = chrome.i18n.getMessage('status_encoding', [String(task.progress || 0)]) || `Encoding to MP3... ${task.progress || 0}%`;
      } else if (task.status === 'decoding') {
        statusText = chrome.i18n.getMessage('status_decoding') || 'Decoding audio tracks...';
      } else if (task.status === 'encoding') {
        statusText = chrome.i18n.getMessage('status_encoding', [String(task.progress || 0)]) || `Encoding to MP3... ${task.progress || 0}%`;
      } else if (task.status === 'embedding') {
        statusText = chrome.i18n.getMessage('status_embedding') || 'Finalizing file...';
      } else if (task.status === 'ready') {
        statusText = chrome.i18n.getMessage('status_ready') || 'Ready to Save / Preview';
      } else if (task.status === 'success') {
        statusText = chrome.i18n.getMessage('status_completed') || 'Completed';
      } else if (task.status === 'failed') {
        statusText = chrome.i18n.getMessage('status_failed') || 'Failed';
      } else if (task.status === 'cancelled') {
        statusText = chrome.i18n.getMessage('status_cancelled') || 'Cancelled';
      }

      let card = downloadsListEl.querySelector(`.download-card[data-task-id="${taskId}"]`);
      
      if (!card) {
        card = document.createElement('div');
        card.className = `download-card ${isAudioType ? 'is-audio' : 'is-video'}`;
        card.setAttribute('data-task-id', taskId);
        card.setAttribute('data-status', task.status);
        downloadsListEl.appendChild(card);
        renderCard(card, taskId, task, statusText, isReady, isFailed, isPending, isAudioType);
      } else {
        if (card.getAttribute('data-status') !== task.status) {
          card.setAttribute('data-status', task.status);
          renderCard(card, taskId, task, statusText, isReady, isFailed, isPending, isAudioType);
        } else {
          const statusTextEl = card.querySelector('.status-text');
          if (statusTextEl) statusTextEl.textContent = statusText;
          const progressEl = card.querySelector('mdui-linear-progress');
          if (progressEl) {
            progressEl.setAttribute('value', task.progress || 0);
          }
        }
      }
    });
  }

  function renderCard(card, taskId, task, statusText, isReady, isFailed, isPending, isAudioType) {
    card.innerHTML = `
      <div class="card-content">
        <div class="card-header">
          <div class="thumbnail-wrapper">
            <img src="${task.thumbnail || 'icons/icon.svg'}" alt="thumbnail" class="thumb-img">
          </div>
          <div class="info-wrapper">
            <h4 class="file-name">${task.title}</h4>
            <p class="status-text">${statusText}</p>
          </div>
        </div>
        ${!isReady && !isFailed ? `
          <div class="progress-bar-wrapper">
            <mdui-linear-progress value="${task.progress || 0}"></mdui-linear-progress>
          </div>
        ` : ''}
        <div class="button-group">
          ${isReady ? `
            <mdui-button variant="tonal" class="save-btn" data-task-id="${taskId}">
              ${chrome.i18n.getMessage('ui_save') || 'Save'}
            </mdui-button>
            <mdui-button variant="tonal" class="preview-btn" data-task-id="${taskId}" style="background: rgb(var(--mdui-color-secondary-container)); color: rgb(var(--mdui-color-on-secondary-container));">
              ${chrome.i18n.getMessage('ui_preview') || 'Preview'}
            </mdui-button>
            <mdui-button variant="text" style="color: rgb(var(--mdui-color-error));" class="delete-btn" data-task-id="${taskId}">
              ${chrome.i18n.getMessage('ui_close') || 'Close'}
            </mdui-button>
          ` : ''}
          ${isPending ? `
            <mdui-button variant="text" style="color: rgb(var(--mdui-color-error));" class="cancel-btn" data-task-id="${taskId}">
              ${chrome.i18n.getMessage('ui_cancel') || 'Cancel'}
            </mdui-button>
          ` : ''}
        </div>
      </div>
    `;

    const thumbImg = card.querySelector('.thumb-img');
    if (thumbImg) {
      thumbImg.onerror = () => { thumbImg.src = 'icons/icon.svg'; };
    }
    
    const saveBtn = card.querySelector('.save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (typeof chrome.offscreen !== 'undefined' && !isAndroid) {
          chrome.runtime.sendMessage({
            action: 'trigger_offscreen_save',
            taskId: taskId,
            filename: task.title
          }, async (res) => {
            if (res && res.success) {
              if (task.url) URL.revokeObjectURL(task.url);
              await deleteLocalTask(taskId);
              delete localTasks[taskId];
              refreshUI();
            } else {
              console.warn("Offscreen download failed, falling back to anchor click:", res ? res.error : "Unknown error");
              const a = document.createElement("a");
              a.href = task.url;
              a.download = task.title;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              if (task.url) URL.revokeObjectURL(task.url);
              await deleteLocalTask(taskId);
              delete localTasks[taskId];
              refreshUI();
            }
          });
        } else {
          const a = document.createElement("a");
          a.href = task.url;
          a.download = task.title;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (task.url) URL.revokeObjectURL(task.url);
          await deleteLocalTask(taskId);
          delete localTasks[taskId];
          refreshUI();
        }
      });
    }
    
    const previewBtn = card.querySelector('.preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        const thumbWrapper = card.querySelector('.thumbnail-wrapper');
        if (card.classList.contains('preview-active')) {
          card.classList.remove('preview-active');
          previewBtn.textContent = chrome.i18n.getMessage('ui_preview') || 'Preview';
          const imgEl = document.createElement('img');
          imgEl.src = task.thumbnail || 'icons/icon.svg';
          imgEl.alt = 'thumbnail';
          imgEl.onerror = () => { imgEl.src = 'icons/icon.svg'; };
          thumbWrapper.innerHTML = '';
          thumbWrapper.appendChild(imgEl);
        } else {
          card.classList.add('preview-active');
          previewBtn.textContent = chrome.i18n.getMessage('ui_close_preview') || 'Close Preview';
          if (isAudioType) {
            thumbWrapper.innerHTML = `<audio src="${task.url}" controls autoplay></audio>`;
          } else {
            thumbWrapper.innerHTML = `<video src="${task.url}" controls autoplay></video>`;
          }
        }
      });
    }
    
    const deleteBtn = card.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (task.url) {
          URL.revokeObjectURL(task.url);
        }
        await deleteLocalTask(taskId);
        delete localTasks[taskId];
        refreshUI();
      });
    }
    
    const cancelBtn = card.querySelector('.cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'cancel_download', taskId });
        delete localTasks[taskId];
        refreshUI();
      });
    }
  }

  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'progress_update') {
      updateUI(message.activeDownloads);
    }
  });

  
  let isProcessing = false;
  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (true) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'pop_download_queue' }, resolve);
      });

      if (!response || !response.arrayBuffer) {
        break;
      }

      await handleDownloadItem(response);
    }

    isProcessing = false;
  }

  async function handleDownloadItem(item) {
    try {
      let { arrayBuffer, filename, taskId, thumbnail } = item;
      const isOffscreen = window.location.search.includes('offscreen=true') || window.location.pathname.includes('offscreen.html');
      
      
      if (taskId) {
        localTasks[taskId] = {
          title: filename,
          thumbnail: thumbnail || 'icons/icon.svg',
          progress: 0,
          status: 'decoding',
          url: null
        };
        refreshUI();
      }

      const updateProgress = (pct, status) => {
        if (taskId && localTasks[taskId]) {
          localTasks[taskId].progress = pct;
          localTasks[taskId].status = status;
          refreshUI();
          
          
          chrome.runtime.sendMessage({
            action: 'update_progress_broadcast',
            taskId,
            progress: pct,
            status,
            title: filename,
            thumbnail
          }).catch(() => {});
        }
      };

      const isMp3 = filename.toLowerCase().endsWith('.mp3');
      const isM4a = filename.toLowerCase().endsWith('.m4a');
      const isWebm = filename.toLowerCase().endsWith('.webm');

      updateProgress(99, 'embedding');

      let mimeType = 'video/mp4';
      if (isMp3) mimeType = 'audio/mp3';
      else if (isM4a) mimeType = 'audio/x-m4a';
      else if (isWebm) mimeType = 'audio/webm';

      const blob = new Blob([arrayBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const resolvedTaskId = taskId || ('task_' + Date.now());

      if (isOffscreen) {
        
        await persistTask(resolvedTaskId, arrayBuffer, mimeType, {
          title: filename,
          thumbnail,
          status: 'ready',
          progress: 100
        });

        
        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: false
        }, (downloadId) => {
          chrome.runtime.sendMessage({
            action: 'remove_active_download',
            taskId: resolvedTaskId,
            status: 'success',
            filename: filename,
            thumbnail: thumbnail
          }).catch(() => {});
          chrome.runtime.sendMessage({ action: 'offscreen_download_complete' });
        });
      } else {
        if (resolvedTaskId) {
          if (!localTasks[resolvedTaskId]) {
            localTasks[resolvedTaskId] = {
              title: filename,
              thumbnail: thumbnail || 'icons/icon.svg',
              url: null
            };
          }
          localTasks[resolvedTaskId].status = 'ready';
          localTasks[resolvedTaskId].progress = 100;
          localTasks[resolvedTaskId].url = url;
          localTasks[resolvedTaskId].blob = blob;

          await persistTask(resolvedTaskId, arrayBuffer, mimeType, {
            title: filename,
            thumbnail,
            status: 'ready',
            progress: 100
          });

          refreshUI();

          chrome.runtime.sendMessage({
            action: 'remove_active_download',
            taskId: resolvedTaskId,
            status: 'success',
            filename,
            thumbnail
          }).catch(() => {});
        }
      }

    } catch (err) {
      console.error("Download processing error:", err);
      if (taskId && localTasks[taskId]) {
        localTasks[taskId].status = 'failed';
        refreshUI();
      }
    }
  }

  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'new_download_queued') {
      processQueue();
    }
  });

  
  processQueue();
});
