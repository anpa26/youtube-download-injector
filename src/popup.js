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
  const activeDownloadsContainer = document.getElementById('active-downloads-container');
  const historyContainer = document.getElementById('history-container');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const downloadManagerBtn = document.getElementById('download-manager-btn');

  if (downloadManagerBtn) {
    downloadManagerBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('download.html') });
    });
  }

  const settingInjectBtn = document.getElementById('setting-inject-btn');
  const settingDownloadMode = document.getElementById('setting-download-mode');
  const directDownloadOptions = document.getElementById('direct-download-options');
  const settingDirectFormat = document.getElementById('setting-direct-format');
  const settingDirectResolution = document.getElementById('setting-direct-resolution');
  const settingDirectCodec = document.getElementById('setting-direct-codec');
  const settingEmbedSubtitles = document.getElementById('setting-embed-subtitles');
  const settingAutoEmbedSubtitles = document.getElementById('setting-auto-embed-subtitles');
  const settingEmbedAudioTracks = document.getElementById('setting-embed-audiotracks');
  const settingAutoEmbedAudioTracks = document.getElementById('setting-auto-embed-audiotracks');
  const settingTheme = document.getElementById('setting-theme');

  function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.textContent = message;
      }
    });

    renderHistory();
    requestActiveDownloads();
  }

  const navToggleBtn = document.getElementById('nav-toggle-btn');
  const viewHome = document.getElementById('view-home');
  const viewSettings = document.getElementById('view-settings');

  function switchToTab(tabName) {
    if (tabName === 'settings') {
      viewHome.classList.remove('active');
      viewSettings.classList.add('active');
      navToggleBtn.textContent = chrome.i18n.getMessage('tab_home') || 'Home';
      navToggleBtn.setAttribute('data-i18n', 'tab_home');
    } else {
      viewSettings.classList.remove('active');
      viewHome.classList.add('active');
      navToggleBtn.textContent = chrome.i18n.getMessage('tab_settings') || 'Settings';
      navToggleBtn.setAttribute('data-i18n', 'tab_settings');
    }
  }

  navToggleBtn.addEventListener('click', () => {
    if (viewSettings.classList.contains('active')) {
      switchToTab('home');
    } else {
      switchToTab('settings');
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('options') === 'true') {
    switchToTab('settings');
  }

  function updateDirectOptionsVisibility() {
    const isDirect = settingDownloadMode.value === 'direct';
    directDownloadOptions.style.display = isDirect ? 'block' : 'none';
    
    if (isDirect) {
      const format = settingDirectFormat.value;
      const isAudio = format === 'mp3' || format === 'm4a';
      document.getElementById('direct-resolution-item').style.display = isAudio ? 'none' : 'flex';
      document.getElementById('direct-codec-item').style.display = isAudio ? 'none' : 'flex';
    }
  }

  function updateSubtitleOptionsVisibility() {
    const embedEnabled = settingEmbedSubtitles.checked;
    const autoEmbedItem = document.getElementById('auto-embed-subtitles-item');
    if (autoEmbedItem) {
      autoEmbedItem.style.display = embedEnabled ? 'flex' : 'none';
    }
  }

  function updateAudioTracksOptionsVisibility() {
    const embedEnabled = settingEmbedAudioTracks.checked;
    const autoEmbedItem = document.getElementById('auto-embed-audiotracks-item');
    if (autoEmbedItem) {
      autoEmbedItem.style.display = embedEnabled ? 'flex' : 'none';
    }
  }

  function applyTheme(theme, pitchBlack = true) {
    document.documentElement.classList.remove('mdui-theme-auto', 'mdui-theme-dark', 'mdui-theme-light', 'theme-pitch-black');
    if (theme === 'dark') {
      document.documentElement.classList.add('mdui-theme-dark');
      if (pitchBlack) {
        document.documentElement.classList.add('theme-pitch-black');
      }
    } else {
      document.documentElement.classList.add('mdui-theme-light');
    }
  }

  chrome.storage.local.get([
    'injectBtnEnabled', 
    'embedSubtitlesEnabled', 
    'autoEmbedAllSubtitlesEnabled',
    'embedAudioTracksEnabled',
    'autoEmbedAllAudioTracksEnabled',
    'downloadMode',
    'directFormat',
    'directResolution',
    'directCodec',
    'theme',
    'pitchBlack'
  ], (res) => {
    settingInjectBtn.checked = res.injectBtnEnabled !== false;
    settingEmbedSubtitles.checked = res.embedSubtitlesEnabled !== false;
    settingAutoEmbedSubtitles.checked = res.autoEmbedAllSubtitlesEnabled === true;
    settingEmbedAudioTracks.checked = res.embedAudioTracksEnabled !== false;
    settingAutoEmbedAudioTracks.checked = res.autoEmbedAllAudioTracksEnabled === true;
    updateSubtitleOptionsVisibility();
    updateAudioTracksOptionsVisibility();
    if (settingDownloadMode) {
      settingDownloadMode.value = res.downloadMode || 'popup';
    }
    if (settingTheme) {
      settingTheme.value = res.theme || 'light';
    }
    applyTheme(res.theme || 'light', res.pitchBlack !== false);
    if (settingDirectFormat) {
      settingDirectFormat.value = res.directFormat || 'mp4';
    }
    if (settingDirectResolution) {
      settingDirectResolution.value = res.directResolution || '1080p';
    }
    if (settingDirectCodec) {
      settingDirectCodec.value = res.directCodec || 'any';
    }
    updateDirectOptionsVisibility();
    
  });

  settingInjectBtn.addEventListener('change', (e) => {
    chrome.storage.local.set({ injectBtnEnabled: e.target.checked }, () => {
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
        });
      });
    });
  });

  if (settingDownloadMode) {
    settingDownloadMode.addEventListener('change', (e) => {
      chrome.storage.local.set({ downloadMode: e.target.value }, () => {
        updateDirectOptionsVisibility();
        chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
          });
        });
      });
    });
  }

  if (settingTheme) {
    settingTheme.addEventListener('change', (e) => {
      const themeVal = e.target.value;
      chrome.storage.local.get(['pitchBlack'], (res) => {
        const pitchBlack = res.pitchBlack !== false;
        chrome.storage.local.set({ theme: themeVal }, () => {
          applyTheme(themeVal, pitchBlack);
        });
      });
    });
  }

  if (settingDirectFormat) {
    settingDirectFormat.addEventListener('change', (e) => {
      chrome.storage.local.set({ directFormat: e.target.value }, () => {
        updateDirectOptionsVisibility();
        chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
          });
        });
      });
    });
  }

  if (settingDirectResolution) {
    settingDirectResolution.addEventListener('change', (e) => {
      chrome.storage.local.set({ directResolution: e.target.value }, () => {
        chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
          });
        });
      });
    });
  }

  if (settingDirectCodec) {
    settingDirectCodec.addEventListener('change', (e) => {
      chrome.storage.local.set({ directCodec: e.target.value }, () => {
        chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
          });
        });
      });
    });
  }

  settingEmbedSubtitles.addEventListener('change', (e) => {
    chrome.storage.local.set({ embedSubtitlesEnabled: e.target.checked }, () => {
      updateSubtitleOptionsVisibility();
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
        });
      });
    });
  });

  settingAutoEmbedSubtitles.addEventListener('change', (e) => {
    chrome.storage.local.set({ autoEmbedAllSubtitlesEnabled: e.target.checked }, () => {
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
        });
      });
    });
  });

  settingEmbedAudioTracks.addEventListener('change', (e) => {
    chrome.storage.local.set({ embedAudioTracksEnabled: e.target.checked }, () => {
      updateAudioTracksOptionsVisibility();
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
        });
      });
    });
  });

  settingAutoEmbedAudioTracks.addEventListener('change', (e) => {
    chrome.storage.local.set({ autoEmbedAllAudioTracksEnabled: e.target.checked }, () => {
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' }).catch(() => {});
        });
      });
    });
  });

  function renderHistory() {
    chrome.runtime.sendMessage({ action: 'get_history_db' }, (history) => {
      history = history || [];
      if (history.length === 0) {
        historyContainer.innerHTML = `<div class="empty-state" data-i18n="no_history">${chrome.i18n.getMessage('no_history')}</div>`;
        return;
      }

      historyContainer.innerHTML = '';
      history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        const thumbSrc = item.thumbnail || 'icons/icon.svg';
        const formattedTime = new Date(item.time).toLocaleDateString(chrome.i18n.getUILanguage().startsWith('id') ? 'id-ID' : 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const statusClass = item.status === 'success' ? 'success' : 'failed';
        const statusText = item.status === 'success' ? chrome.i18n.getMessage('status_completed') : chrome.i18n.getMessage('status_failed');

        div.innerHTML = `
          <img src="${thumbSrc}" class="history-thumb" alt="thumb">
          <div class="history-details">
            <span class="history-title" title="${item.title}">${item.title}</span>
            <div class="history-meta">
              <span>${formattedTime}</span>
              <span class="history-status ${statusClass}">${statusText}</span>
            </div>
          </div>
        `;
        historyContainer.appendChild(div);
      });
    });
  }



  clearHistoryBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clear_all_db' }, () => {
      renderHistory();
    });
  });

  function requestActiveDownloads() {
    chrome.runtime.sendMessage({ action: 'get_active_downloads' }, (response) => {
      if (response && response.activeDownloads) {
        updateActiveDownloadsUI(response.activeDownloads);
      }
    });
  }

  function updateActiveDownloadsUI(activeDownloads) {
    const keys = Object.keys(activeDownloads);
    if (keys.length === 0) {
      activeDownloadsContainer.innerHTML = `<div class="empty-state" data-i18n="no_active_downloads">${chrome.i18n.getMessage('no_active_downloads')}</div>`;
      return;
    }

    activeDownloadsContainer.innerHTML = '';
    keys.forEach(taskId => {
      const task = activeDownloads[taskId];
      const item = document.createElement('div');
      item.className = 'active-download-item';

      let statusMsg = chrome.i18n.getMessage('status_downloading');
      if (task.status === 'muxing') {
        statusMsg = chrome.i18n.getMessage('status_muxing');
      } else if (task.status === 'embedding') {
        statusMsg = chrome.i18n.getMessage('status_embedding');
      }

      item.innerHTML = `
        <div class="active-download-info">
          <span class="active-download-title" title="${task.title}">${task.title}</span>
          <button class="active-download-cancel" data-id="${taskId}">✕</button>
        </div>
        <div class="active-download-progress-bar">
          <div class="active-download-progress-fill" style="width: ${task.progress}%"></div>
        </div>
        <div class="active-download-meta">
          <span>${statusMsg}</span>
          <span>${task.progress}%</span>
        </div>
      `;

      item.querySelector('.active-download-cancel').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'cancel_download', taskId: taskId });
      });

      activeDownloadsContainer.appendChild(item);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'progress_update' && message.activeDownloads) {
      updateActiveDownloadsUI(message.activeDownloads);
    } else if (message.action === 'history_updated') {
      renderHistory();
    }
  });

  applyLanguage();
  renderHistory();
  requestActiveDownloads();

  setInterval(requestActiveDownloads, 5000);
});
