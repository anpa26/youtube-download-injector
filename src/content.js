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


(function() {
  try {
    Object.defineProperty(Uint8Array, Symbol.hasInstance, {
      value: function(instance) {
        return instance && (
          Object.prototype.toString.call(instance) === '[object Uint8Array]' ||
          instance.constructor?.name === 'Uint8Array'
        );
      },
      configurable: true
    });
  } catch (e) {
    console.warn("Failed to override Uint8Array Symbol.hasInstance", e);
  }

  let currentVideoId = null;
  let injectBtnEnabled = true;
  let multiDetectEnabled = true;
  let embedSubtitlesEnabled = true;
  let autoEmbedAllSubtitlesEnabled = false;
  let embedAudioTracksEnabled = true;
  let autoEmbedAllAudioTracksEnabled = false;
  let downloadMode = 'popup';
  let directFormat = 'mp4';
  let directResolution = '1080p';
  let directCodec = 'any';

  const extensionAPI = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome : (typeof browser !== 'undefined' && browser.runtime ? browser : null);

  const styles = `
    .yt-downloader-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 3px !important;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.05) 100%) !important;
      color: var(--yt-spec-text-primary, #f1f1f1) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 20px !important;
      padding-left: 8px !important;
      padding-right: 14px !important;
      height: 40px !important;
      font-family: Roboto, Arial, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      margin-left: 8px !important;
      outline: none !important;
      vertical-align: middle !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
      transition: background 0.2s ease, border-color 0.2s ease !important;
    }
    .yt-downloader-btn:hover {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.10) 100%) !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
    }
    .yt-downloader-btn svg {
      width: 24px !important;
      height: 24px !important;
    }
    .yt-downloader-btn.mobile-circle {
      width: 40px !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      border-radius: 50% !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      margin-left: -6px !important;
      margin-right: 6px !important;
      transform: translateY(5px) !important;
      transition: background-color 0.1s ease !important;
    }
    .yt-downloader-btn.mobile-circle span {
      display: none !important;
    }
    .yt-downloader-btn.mobile-circle svg {
      width: 28px !important;
      height: 28px !important;
      transform: scaleX(1.15) !important;
    }
    @media (hover: hover) {
      .yt-downloader-btn.mobile-circle:hover {
        background-color: rgba(255, 255, 255, 0.12) !important;
        border: none !important;
      }
    }
    .yt-downloader-btn.mobile-circle:active,
    .yt-downloader-btn.mobile-circle.active-touch {
      background-color: rgba(255, 255, 255, 0.22) !important;
      border: none !important;
      transition: none !important;
    }
    .yt-downloader-dropdown,
    .yt-sub-modal {
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      z-index: 99999 !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255, 62, 62, 0.3) !important;
      border-radius: 20px !important;
      width: 290px !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4) !important;
      padding: 16px !important;
      font-family: Roboto, Arial, sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
    }
    .yt-downloader-dropdown.theme-dark,
    .yt-sub-modal.theme-dark {
      background: rgba(15, 15, 21, 0.94) !important;
      color: #fff !important;
      border-color: rgba(255, 62, 62, 0.3) !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6) !important;
    }
    .yt-downloader-dropdown.theme-light,
    .yt-sub-modal.theme-light {
      background: rgba(255, 255, 255, 0.96) !important;
      color: #0f0f0f !important;
      border-color: rgba(255, 62, 62, 0.25) !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15) !important;
    }
    /* Ensure select options styling is correct for dark/light mode */
    .yt-downloader-dropdown.theme-dark select option {
      background-color: #1f1f2e !important;
      color: #ffffff !important;
    }
    .yt-downloader-dropdown.theme-light select option {
      background-color: #ffffff !important;
      color: #0f0f0f !important;
    }
    .yt-downloader-dropdown-title,
    .yt-sub-modal-title {
      font-size: 14px !important;
      font-weight: 800 !important;
      color: var(--yt-spec-text-primary, inherit) !important;
      text-transform: none !important;
      margin-bottom: 8px !important;
      letter-spacing: 0.02em !important;
      text-align: center !important;
    }
    .yt-sub-modal-desc {
      font-size: 12px !important;
      color: var(--yt-spec-text-secondary, #aaa) !important;
      margin-bottom: 6px !important;
      line-height: 1.4 !important;
    }
    .yt-downloader-dropdown-section {
      margin-bottom: 10px !important;
    }
    .yt-downloader-dropdown-section-title {
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #ff3e3e !important;
      margin-bottom: 4px !important;
    }
    .yt-downloader-item {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 10px 14px !important;
      border-radius: 9999px !important;
      cursor: pointer !important;
      font-size: 12px !important;
      background: rgba(255, 255, 255, 0.06) !important;
      margin-bottom: 6px !important;
      border: 1px solid rgba(255, 255, 255, 0.05) !important;
      color: inherit !important;
    }
    .yt-downloader-item:hover {
      background: rgba(255, 62, 62, 0.15) !important;
      border-color: rgba(255, 62, 62, 0.3) !important;
    }
    .yt-downloader-item-left {
      font-weight: 600 !important;
    }
    .yt-downloader-item-right {
      color: var(--yt-spec-text-secondary, #bbb) !important;
      font-size: 11px !important;
    }
    .yt-downloader-loading {
      text-align: center !important;
      padding: 16px !important;
      font-size: 13px !important;
      color: inherit !important;
    }
    .yt-downloader-dropdown-field {
      margin-bottom: 10px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }
    .yt-downloader-dropdown-field label {
      font-size: 11px !important;
      color: var(--yt-spec-text-secondary, #aaa) !important;
      font-weight: 700 !important;
      text-transform: none !important;
      letter-spacing: 0.06em !important;
      padding-left: 6px !important;
    }
    .yt-downloader-dropdown-field select {
      background: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid rgba(255, 62, 62, 0.25) !important;
      color: inherit !important;
      border-radius: 9999px !important;
      padding: 8px 32px 8px 14px !important;
      font-size: 13px !important;
      outline: none !important;
      cursor: pointer !important;
      font-family: inherit !important;
      width: auto !important;
      min-width: auto !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff3e3e' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 10px center !important;
      background-size: 12px !important;
      field-sizing: content !important;
    }
    .yt-downloader-dropdown.theme-light .yt-downloader-dropdown-field select {
      background: rgba(0, 0, 0, 0.05) !important;
      border-color: rgba(255, 62, 62, 0.3) !important;
    }
    .yt-downloader-dropdown-field select:focus {
      border-color: #ff3e3e !important;
      background-color: rgba(255, 62, 62, 0.1) !important;
    }
    .yt-downloader-action-btn,
    .yt-sub-btn-download {
      width: 100% !important;
      background: linear-gradient(135deg, #ff3e3e 0%, #ff6b6b 100%) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 9999px !important;
      padding: 10px !important;
      font-weight: bold !important;
      font-size: 13px !important;
      cursor: pointer !important;
      margin-top: 6px !important;
      text-align: center !important;
      box-shadow: 0 4px 15px rgba(255, 62, 62, 0.35) !important;
    }
    .yt-downloader-action-btn:hover,
    .yt-sub-btn-download:hover {
      opacity: 0.92 !important;
    }
    .yt-sub-list {
      max-height: 180px !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      padding-right: 4px !important;
    }
    .yt-sub-item {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 8px 12px !important;
      background: rgba(255, 255, 255, 0.06) !important;
      border-radius: 9999px !important;
      border: 1px solid rgba(255, 62, 62, 0.15) !important;
      cursor: pointer !important;
      font-size: 12px !important;
      margin: 0 !important;
      color: inherit !important;
    }
    .yt-sub-modal.theme-light .yt-sub-item {
      background: rgba(0, 0, 0, 0.04) !important;
    }
    .yt-sub-item:hover {
      background: rgba(255, 62, 62, 0.12) !important;
      border-color: rgba(255, 62, 62, 0.3) !important;
    }
    .yt-sub-item input[type="checkbox"] {
      width: 16px !important;
      height: 16px !important;
      accent-color: #ff3e3e !important;
      cursor: pointer !important;
      margin: 0 !important;
    }
    .yt-sub-modal-buttons {
      display: flex !important;
      gap: 8px !important;
      margin-top: 6px !important;
    }
    .yt-sub-btn {
      flex: 1 !important;
      padding: 10px !important;
      border-radius: 9999px !important;
      font-weight: bold !important;
      font-size: 13px !important;
      cursor: pointer !important;
      text-align: center !important;
      border: none !important;
    }
    .yt-sub-btn-cancel {
      background: rgba(255, 255, 255, 0.12) !important;
      color: inherit !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
    .yt-sub-modal.theme-light .yt-sub-btn-cancel {
      background: rgba(0, 0, 0, 0.06) !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    .yt-sub-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.2) !important;
    }
    .yt-downloader-menu-item.ytm-menu-item {
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      height: 48px !important;
      padding: 0 16px !important;
      background: transparent !important;
      border: none !important;
      color: var(--yt-spec-text-primary, #f1f1f1) !important;
      font-family: inherit !important;
      font-size: 16px !important;
      text-align: left !important;
      cursor: pointer !important;
      outline: none !important;
    }
    .yt-downloader-menu-item.ytm-menu-item:hover {
      background-color: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1)) !important;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  let appTheme = 'light';

  function loadSettings() {
    if (extensionAPI && extensionAPI.storage) {
      try {
        extensionAPI.storage.local.get([
          'injectBtnEnabled', 
          'multiDetectEnabled', 
          'embedSubtitlesEnabled', 
          'autoEmbedAllSubtitlesEnabled', 
          'embedAudioTracksEnabled',
          'autoEmbedAllAudioTracksEnabled',
          'downloadMode',
          'directFormat',
          'directResolution',
          'directCodec',
          'theme'
        ], (res) => {
          injectBtnEnabled = (res && res.injectBtnEnabled !== false);
          multiDetectEnabled = (res && res.multiDetectEnabled !== false);
          embedSubtitlesEnabled = (res && res.embedSubtitlesEnabled !== false);
          autoEmbedAllSubtitlesEnabled = (res && res.autoEmbedAllSubtitlesEnabled === true);
          embedAudioTracksEnabled = (res && res.embedAudioTracksEnabled !== false);
          autoEmbedAllAudioTracksEnabled = (res && res.autoEmbedAllAudioTracksEnabled === true);
          downloadMode = (res && res.downloadMode) || 'popup';
          directFormat = (res && res.directFormat) || 'mp4';
          directResolution = (res && res.directResolution) || '1080p';
          directCodec = (res && res.directCodec) || 'any';
          appTheme = (res && res.theme) || 'light';
          runInjectionSync();
        });
      } catch (err) {
        console.warn('[YT-Downloader] Storage API error:', err);
        runInjectionSync();
      }
    } else {
      runInjectionSync();
    }
  }

  if (extensionAPI && extensionAPI.storage) {
    try {
      extensionAPI.storage.onChanged.addListener((changes) => {
        if (changes.injectBtnEnabled) {
          injectBtnEnabled = changes.injectBtnEnabled.newValue !== false;
        }
        if (changes.multiDetectEnabled) {
          multiDetectEnabled = changes.multiDetectEnabled.newValue !== false;
        }
        if (changes.embedSubtitlesEnabled) {
          embedSubtitlesEnabled = changes.embedSubtitlesEnabled.newValue !== false;
        }
        if (changes.autoEmbedAllSubtitlesEnabled) {
          autoEmbedAllSubtitlesEnabled = changes.autoEmbedAllSubtitlesEnabled.newValue === true;
        }
        if (changes.embedAudioTracksEnabled) {
          embedAudioTracksEnabled = changes.embedAudioTracksEnabled.newValue !== false;
        }
        if (changes.autoEmbedAllAudioTracksEnabled) {
          autoEmbedAllAudioTracksEnabled = changes.autoEmbedAllAudioTracksEnabled.newValue === true;
        }
        if (changes.downloadMode) {
          downloadMode = changes.downloadMode.newValue || 'popup';
        }
        if (changes.directFormat) {
          directFormat = changes.directFormat.newValue || 'mp4';
        }
        if (changes.directResolution) {
          directResolution = changes.directResolution.newValue || '1080p';
        }
        if (changes.directCodec) {
          directCodec = changes.directCodec.newValue || 'any';
        }
        if (changes.theme) {
          appTheme = changes.theme.newValue || 'light';
        }
        runInjectionSync();
      });
    } catch (e) {
      console.warn('[YT-Downloader] Storage change listener failed:', e);
    }
  }

  let lastClickedVideo = null;
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button, ytd-button-renderer, yt-icon-button, a');
    if (!button) return;

    const videoCard = button.closest(
      'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer'
    );
    if (videoCard) {
      const linkEl = videoCard.querySelector(
        'a#thumbnail, a#video-title-link, a#video-title, a[href*="/watch?v="], a[href*="/shorts/"]'
      );
      const titleEl = videoCard.querySelector('#video-title, #video-title-link, h3, .title, .ytm-tab-subtitle');
      if (linkEl) {
        const href = linkEl.getAttribute('href') || '';
        const match = href.match(/[?&]v=([^&#]*)/) || href.match(/\/shorts\/([^&#/?]*)/);
        if (match) {
          const videoId = match[1];
          const title = titleEl ? titleEl.textContent.trim() : 'Video';
          lastClickedVideo = { id: videoId, title: title };
        }
      }
    } else {
      
      lastClickedVideo = null;
    }
  }, true);

  function checkAndInjectMenu() {
    
    const desktopMenus = document.querySelectorAll('ytd-menu-popup-renderer');
    desktopMenus.forEach(menu => {
      injectIntoMenu(menu);
    });

    const mobileMenus = document.querySelectorAll('ytm-action-sheet-renderer, ytm-options-and-action-sheet-renderer, .ytm-action-sheet-layout, .ytm-menu-item-list, ytm-menu, .bottom-sheet-media-menu-item');
    mobileMenus.forEach(menu => {
      injectIntoMenu(menu);
    });
  }

  function injectIntoMenu(menuElement) {
    const isDesktop = menuElement.tagName === 'YTD-MENU-POPUP-RENDERER';
    const isMobile = menuElement.tagName === 'YTM-ACTION-SHEET-RENDERER' || 
                     menuElement.tagName === 'YTM-OPTIONS-AND-ACTION-SHEET-RENDERER' || 
                     menuElement.tagName === 'YTM-MENU' ||
                     menuElement.classList.contains('ytm-action-sheet-layout') || 
                     menuElement.classList.contains('ytm-menu-item-list') || 
                     menuElement.classList.contains('bottom-sheet-media-menu-item') ||
                     menuElement.tagName === 'YTM-MENU-NAVIGATION-ITEM-RENDERER' ||
                     menuElement.classList.contains('ytm-menu-item') ||
                     !!menuElement.querySelector('.ytm-action-sheet-layout, .ytm-menu-item-list, ytm-menu, .bottom-sheet-media-menu-item');

    if (!isDesktop && !isMobile) return;

    let container = null;
    if (isDesktop) {
      container = menuElement.querySelector('#items, tp-yt-paper-listbox');
    } else {
      const mediaMenuItem = menuElement.classList.contains('bottom-sheet-media-menu-item') || menuElement.tagName === 'YTM-MENU-NAVIGATION-ITEM-RENDERER' || menuElement.classList.contains('ytm-menu-item') ? menuElement : menuElement.querySelector('.bottom-sheet-media-menu-item, ytm-menu-navigation-item-renderer, .ytm-menu-item');
      container = mediaMenuItem ? mediaMenuItem.parentElement : 
                  (menuElement.classList.contains('ytm-menu-item-list') || menuElement.classList.contains('ytm-action-sheet-layout') || menuElement.tagName === 'YTM-MENU' ? 
                   menuElement : 
                   menuElement.querySelector('.ytm-action-sheet-layout, .ytm-menu-item-list, .action-sheet-content, ytm-menu'));
    }

    if (!container) return;

    if (container.querySelector('.yt-downloader-menu-item')) return;

    let videoId = null;
    let videoTitle = 'Video';

    if (lastClickedVideo) {
      videoId = lastClickedVideo.id;
      videoTitle = lastClickedVideo.title;
    } else {
      videoId = getUrlVideoId();
      if (!videoId) return;
      const titleEl = document.querySelector('h1.title, ytm-slim-video-metadata-section .slim-video-metadata-title, .title-text, .slim-video-information-title-and-badges h1');
      if (titleEl) {
        videoTitle = titleEl.textContent.trim();
      }
    }

    if (isDesktop) {
      const newItem = document.createElement('ytd-menu-service-item-renderer');
      newItem.className = 'yt-downloader-menu-item';
      newItem.innerHTML = `
        <tp-yt-paper-item role="menuitem" class="style-scope ytd-menu-service-item-renderer" tabindex="-1" aria-disabled="false">
          <span class="yt-downloader-menu-icon" style="margin-left: -2px; margin-right: 10px; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: var(--yt-spec-text-primary, #f1f1f1); flex-shrink: 0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; display: block; width: 26px; height: 26px;">
              <line x1="6" y1="19" x2="18" y2="19" />
              <polyline points="7 12 12 17 17 12" />
              <line x1="12" y1="17" x2="12" y2="4" />
            </svg>
          </span>
          <span class="style-scope ytd-menu-service-item-renderer" style="font-size: 14px;">Download</span>
        </tp-yt-paper-item>
      `;

      newItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const ironDropdown = menuElement.closest('iron-dropdown');
        if (ironDropdown) {
          ironDropdown.style.display = 'none';
          const overlay = document.querySelector('iron-overlay-backdrop');
          if (overlay) overlay.style.display = 'none';
        }

        if (downloadMode === 'direct') {
          triggerDirectDownload(null, videoId);
        } else {
          toggleDropdown(null, videoId, videoTitle);
        }
      });

      const items = Array.from(container.children);
      let shareItem = null;
      for (const item of items) {
        const text = item.textContent.toLowerCase();
        if (text.includes('share') || text.includes('bagikan') || text.includes('bagikan...')) {
          shareItem = item;
          break;
        }
      }

      if (shareItem) {
        shareItem.before(newItem);
      }
    } else if (isMobile) {

      const newItem = document.createElement('button');
      newItem.className = 'yt-downloader-menu-item ytm-menu-item';

      newItem.addEventListener('touchstart', () => newItem.classList.add('active-touch'), { passive: true });
      newItem.addEventListener('touchend', () => newItem.classList.remove('active-touch'), { passive: true });
      newItem.addEventListener('touchcancel', () => newItem.classList.remove('active-touch'), { passive: true });

      newItem.innerHTML = `
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-left: -5px; margin-right: 10px; color: currentColor; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width: 26px; height: 26px;">
            <line x1="6" y1="19" x2="18" y2="19" />
            <polyline points="7 12 12 17 17 12" />
            <line x1="12" y1="17" x2="12" y2="4" />
          </svg>
        </span>
        <span>Download</span>
      `;

      newItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const overlay = document.querySelector('.ytm-overlay-renderer, ytm-overlay-renderer');
        if (overlay) overlay.click();

        if (downloadMode === 'direct') {
          triggerDirectDownload(null, videoId);
        } else {
          toggleDropdown(null, videoId, videoTitle);
        }
      });

      const items = Array.from(container.children);
      let targetItem = null;

      const getItemText = (item) => {
        const attrStr = item.querySelector('.ytAttributedStringHost, yt-attributed-string');
        const text = attrStr ? attrStr.textContent : item.textContent;
        return (text || '').toLowerCase().trim();
      };

      for (const item of items) {
        const text = getItemText(item);
        if (text.includes('tonton nanti') || text.includes('watch later')) {
          targetItem = item;
          break;
        }
      }

      if (!targetItem) {
        for (const item of items) {
          const text = getItemText(item);
          if (text.includes('tidak tertarik') || text.includes('not interested')) {
            targetItem = item;
            break;
          }
        }
      }

      if (!targetItem) {
        for (const item of items) {
          const text = getItemText(item);
          if (text.includes('share') || text.includes('bagikan')) {
            targetItem = item;
            break;
          }
        }
      }

      if (targetItem) {
        targetItem.before(newItem);
      } else {
        container.appendChild(newItem);
      }
    }
  }

  function injectMiniButtonsOnPlaylist() {
    
    const rows = document.querySelectorAll('ytm-playlist-video-renderer, ytm-playlist-panel-video-renderer, ytd-playlist-video-renderer');
    rows.forEach(row => {
      if (row.querySelector('.yt-downloader-mini-btn')) return;

      const linkEl = row.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
      const titleEl = row.querySelector('h3, .title, .media-item-title, #video-title, #video-title-link');
      if (!linkEl) return;

      const href = linkEl.getAttribute('href') || '';
      const match = href.match(/[?&]v=([^&#]*)/) || href.match(/\/shorts\/([^&#/?]*)/);
      if (!match) return;

      const videoId = match[1];
      const videoTitle = titleEl ? titleEl.textContent.trim() : 'Video';

      const img = row.querySelector('img');
      const thumbnailEl = img ? (img.closest('a, ytd-thumbnail, ytm-video-thumbnail-renderer, .thumbnail, .media-item-thumbnail-container, .thumbnail-container') || img.parentElement) : null;

      const btn = document.createElement('button');
      btn.className = 'yt-downloader-mini-btn';

      if (thumbnailEl) {
        thumbnailEl.style.setProperty('position', 'relative', 'important');
        btn.style.cssText = `
          position: absolute !important;
          left: 50% !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 34px !important;
          height: 34px !important;
          border-radius: 50% !important;
          background: rgba(0, 0, 0, 0.65) !important;
          border: 1.5px solid rgba(255, 255, 255, 0.3) !important;
          color: #ffffff !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          z-index: 100 !important;
          padding: 0 !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
          transition: background-color 0.2s ease, transform 0.2s ease !important;
        `;

        btn.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          btn.style.setProperty('background', 'rgba(0, 0, 0, 0.85)', 'important');
          btn.style.setProperty('transform', 'translate(-50%, -50%) scale(0.95)', 'important');
        }, { passive: true });
        btn.addEventListener('touchend', (e) => {
          e.stopPropagation();
          btn.style.setProperty('background', 'rgba(0, 0, 0, 0.65)', 'important');
          btn.style.setProperty('transform', 'translate(-50%, -50%) scale(1)', 'important');
        }, { passive: true });
      } else {
        row.style.setProperty('position', 'relative', 'important');
        const details = row.querySelector('.media-item-info, .details, ytm-playlist-video-renderer-metadata, #meta, .metadata');
        if (details) {
          details.style.setProperty('padding-right', '45px', 'important');
        }

        btn.style.cssText = `
          position: absolute !important;
          right: 10px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          width: 32px !important;
          height: 32px !important;
          border-radius: 50% !important;
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: var(--yt-spec-text-primary, #f1f1f1) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          z-index: 100 !important;
          padding: 0 !important;
        `;

        btn.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          btn.style.setProperty('background', 'rgba(255, 255, 255, 0.2)', 'important');
        }, { passive: true });
        btn.addEventListener('touchend', (e) => {
          e.stopPropagation();
          btn.style.setProperty('background', 'rgba(255, 255, 255, 0.08)', 'important');
        }, { passive: true });
      }

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px; display: block;">
          <line x1="6" y1="19" x2="18" y2="19" />
          <polyline points="7 12 12 17 17 12" />
          <line x1="12" y1="17" x2="12" y2="4" />
        </svg>
      `;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (downloadMode === 'direct') {
          triggerDirectDownload(btn, videoId);
        } else {
          toggleDropdown(btn, videoId, videoTitle);
        }
      });

      if (thumbnailEl) {
        thumbnailEl.appendChild(btn);
      } else {
        row.appendChild(btn);
      }
    });
  }

  function runInjectionSync() {
    if (!injectBtnEnabled) {
      restoreButtons();
      removeButton();
      return;
    }
    
    observer.disconnect();
    try {
      checkAndInject();
      checkAndInjectMenu();
      injectMiniButtonsOnPlaylist();
    } finally {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  const observer = new MutationObserver(() => {
    const videoId = getUrlVideoId();
    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      removeButton();
    }
    runInjectionSync();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function getUrlVideoId() {
    const url = window.location.href;
    const match = url.match(/[?&]v=([^&#]*)/);
    return match ? match[1] : null;
  }

  function isShareBtnIconOnly(shareBtn) {
    if (!shareBtn) return false;
    const text = shareBtn.innerText ? shareBtn.innerText.trim() : '';
    return text.length === 0;
  }

  function checkAndInject() {
    if (!getUrlVideoId()) return;

    const activeMetadata = document.querySelector('ytd-watch-metadata') || 
                           document.querySelector('#owner') ||
                           document.querySelector('ytm-slim-video-metadata-section') ||
                           document.querySelector('.slim-video-metadata-section') ||
                           document.querySelector('ytm-slim-owner-renderer-layout') ||
                           document.querySelector('#top-level-buttons-computed') ||
                           document.querySelector('ytm-slim-video-action-bar-renderer');

    if (!activeMetadata) {
      return; 
    }

    const nativeDownloadBtn = findNativeDownloadButton(activeMetadata);
    if (nativeDownloadBtn) {
      nativeDownloadBtn.style.setProperty('display', 'none', 'important');
    }

    const shareBtn = findShareButton(activeMetadata);
    if (!shareBtn) {
      return; 
    }

    const saveBtn = findSaveButton(activeMetadata);
    if (saveBtn) {
      saveBtn.style.setProperty('display', 'none', 'important');
    }

    const useIconOnly = isShareBtnIconOnly(shareBtn);
    const parentNode = shareBtn.parentNode;
    const existingBtn = parentNode.querySelector('.yt-downloader-btn');

    if (existingBtn) {
      
      parentNode.querySelectorAll('.yt-downloader-btn').forEach(btn => {
        if (useIconOnly) {
          btn.classList.add('mobile-circle');
        } else {
          btn.classList.remove('mobile-circle');
        }
      });
    } else if (parentNode) {
      console.log(`[YT-Downloader] Injecting Download and Save buttons (iconOnly: ${useIconOnly})`);
      const btn = createBtn(useIconOnly);
      const saveBtnCustom = createCustomSaveBtn(useIconOnly);

      parentNode.insertBefore(btn, shareBtn.nextSibling);
      parentNode.insertBefore(saveBtnCustom, btn.nextSibling);
    }
  }

  function findNativeDownloadButton(container) {
    const selectors = [
      'ytd-download-button-renderer',
      'yt-button-view-model[class*="download"]',
      'ytd-button-renderer[class*="download"]',
      'button[aria-label*="Download"]',
      'button[aria-label*="Unduh"]',
      'button[aria-label*="download"]',
      'button[aria-label*="unduh"]',
      '.yt-spec-button-shape-next[aria-label*="Download"]',
      '.yt-spec-button-shape-next[aria-label*="Unduh"]'
    ];

    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el) {
        return el.closest('ytd-download-button-renderer, ytd-button-renderer, yt-button-view-model, ytm-button-renderer, button') || el;
      }
    }
    return null;
  }

  function findShareButton(container) {
    const selectors = [
      'button[aria-label*="Share"]',
      'button[aria-label*="Bagikan"]',
      'button[aria-label*="share"]',
      'button[aria-label*="bagikan"]',
      'yt-button-view-model[class*="share"]',
      'ytd-button-renderer[class*="share"]',
      '.yt-spec-button-shape-next[aria-label*="Share"]',
      '.yt-spec-button-shape-next[aria-label*="Bagikan"]'
    ];

    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el) {
        return el.closest('ytd-button-renderer, yt-button-view-model, ytm-button-renderer, ytd-menu-service-item-renderer, button') || el;
      }
    }
    return null;
  }

  function findSaveButton(container) {
    
    const svgs = container.querySelectorAll('svg');
    for (const svg of svgs) {
      const path = svg.querySelector('path');
      if (path) {
        const d = path.getAttribute('d') || '';
        
        if (d.includes('M14 10') || d.includes('M14,10') || d.includes('m14 10') || d.includes('m14,10') || d.includes('M14h8')) {
          return svg.closest('ytd-button-renderer, yt-button-view-model, ytm-button-renderer, ytd-menu-service-item-renderer, button') || svg;
        }
      }
    }

    const selectors = [
      'button[aria-label*="Save"]',
      'button[aria-label*="Simpan"]',
      'button[aria-label*="save"]',
      'button[aria-label*="simpan"]',
      'yt-button-view-model[class*="save"]',
      'ytd-button-renderer[class*="save"]',
      '.yt-spec-button-shape-next[aria-label*="Save"]',
      '.yt-spec-button-shape-next[aria-label*="Simpan"]'
    ];

    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el) {
        return el.closest('ytd-button-renderer, yt-button-view-model, ytm-button-renderer, ytd-menu-service-item-renderer, button') || el;
      }
    }
    return null;
  }

  function isMobileLayout() {
    return window.location.hostname.startsWith('m.') || 
           window.innerWidth < 650 || 
           !!document.querySelector('ytm-slim-video-metadata-section') ||
           !!document.querySelector('.slim-video-metadata-section') ||
           !!document.querySelector('ytm-slim-owner-renderer-layout') ||
           !!document.querySelector('ytm-slim-video-action-bar-renderer');
  }

  function createCustomSaveBtn(useIconOnly) {
    const btn = document.createElement('button');
    btn.className = 'yt-downloader-btn yt-downloader-save-btn';
    if (useIconOnly) {
      btn.classList.add('mobile-circle');
    }
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg><span>Save</span>';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const activeMetadata = document.querySelector('ytd-watch-metadata') || 
                             document.querySelector('#owner') ||
                             document.querySelector('ytm-slim-video-metadata-section') ||
                             document.querySelector('.slim-video-metadata-section') ||
                             document.querySelector('ytm-slim-owner-renderer-layout') ||
                             document.querySelector('#top-level-buttons-computed') ||
                             document.querySelector('ytm-slim-video-action-bar-renderer');
      if (activeMetadata) {
        const nativeSave = findSaveButton(activeMetadata);
        if (nativeSave) {
          console.log('[YT-Downloader] Triggering native Save button click');
          const clickTarget = nativeSave.querySelector('button') || nativeSave;
          clickTarget.click();
        } else {
          
          const globalSave = document.querySelector('button[aria-label*="Save"]') || 
                             document.querySelector('button[aria-label*="Simpan"]') || 
                             document.querySelector('button[aria-label*="save"]') || 
                             document.querySelector('button[aria-label*="simpan"]');
          if (globalSave) {
            globalSave.click();
          } else {
            console.warn('[YT-Downloader] Native Save button not found');
          }
        }
      }
    });

    btn.addEventListener('touchstart', () => btn.classList.add('active-touch'), { passive: true });
    btn.addEventListener('touchend', () => btn.classList.remove('active-touch'), { passive: true });
    btn.addEventListener('touchcancel', () => btn.classList.remove('active-touch'), { passive: true });

    return btn;
  }

  function createBtn(useIconOnly) {
    const btn = document.createElement('button');
    btn.className = 'yt-downloader-btn';
    if (useIconOnly) {
      btn.classList.add('mobile-circle');
    }
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="19" x2="18" y2="19" /><polyline points="7 12 12 17 17 12" /><line x1="12" y1="17" x2="12" y2="4" /></svg><span>Download</span>';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (downloadMode === 'direct') {
        triggerDirectDownload(btn);
      } else {
        toggleDropdown(btn);
      }
    });

    btn.addEventListener('touchstart', () => btn.classList.add('active-touch'), { passive: true });
    btn.addEventListener('touchend', () => btn.classList.remove('active-touch'), { passive: true });
    btn.addEventListener('touchcancel', () => btn.classList.remove('active-touch'), { passive: true });

    return btn;
  }

  function selectSubtitles(subtitles) {
    return new Promise((resolve) => {
      if (!subtitles || subtitles.length === 0) {
        resolve([]);
        return;
      }
      if (subtitles.length === 1 || autoEmbedAllSubtitlesEnabled) {
        resolve(subtitles);
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'yt-downloader-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.6) !important;
        z-index: 99998 !important;
      `;
      document.body.appendChild(backdrop);

      const modal = document.createElement('div');
      modal.className = `yt-sub-modal theme-${appTheme}`;
      
      let subItemsHtml = '';
      subtitles.forEach((sub, idx) => {
        subItemsHtml += `
          <label class="yt-sub-item">
            <input type="checkbox" data-idx="${idx}" checked>
            <span>${sub.displayName} (${sub.language})</span>
          </label>
        `;
      });

      modal.innerHTML = `
        <div class="yt-sub-modal-title">${chrome.i18n.getMessage('ui_select_subtitles') || 'Select Subtitles'}</div>
        <div class="yt-sub-modal-desc">${chrome.i18n.getMessage('ui_select_subtitles_desc') || 'Choose which subtitles you want to embed in the video:'}</div>
        <div class="yt-sub-list">
          ${subItemsHtml}
        </div>
        <div class="yt-sub-modal-buttons">
          <button class="yt-sub-btn yt-sub-btn-cancel">${chrome.i18n.getMessage('ui_cancel') || 'Cancel'}</button>
          <button class="yt-sub-btn yt-sub-btn-download">${chrome.i18n.getMessage('ui_confirm') || 'Confirm'}</button>
        </div>
      `;

      document.body.appendChild(modal);

      const cleanup = () => {
        backdrop.remove();
        modal.remove();
      };

      modal.querySelector('.yt-sub-btn-cancel').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      modal.querySelector('.yt-sub-btn-download').addEventListener('click', () => {
        const checkedIdxs = Array.from(modal.querySelectorAll('.yt-sub-item input[type="checkbox"]:checked'))
          .map(el => parseInt(el.getAttribute('data-idx'), 10));
        
        const selected = checkedIdxs.map(idx => subtitles[idx]);
        cleanup();
        resolve(selected);
      });
    });
  }

  function selectAudioTracks(audioStreams) {
    return new Promise((resolve) => {
      if (!audioStreams || audioStreams.length === 0) {
        resolve([]);
        return;
      }

      const audioTracks = [];
      const uniqueTrackIds = new Set();
      audioStreams.forEach(s => {
        const trackKey = s.trackId || s.language || s.displayName || 'default';
        if (!uniqueTrackIds.has(trackKey)) {
          uniqueTrackIds.add(trackKey);
          audioTracks.push({
            trackId: s.trackId,
            displayName: s.displayName || 'Default Audio',
            language: s.language || 'und',
            isDefault: !!s.isDefault,
            key: trackKey
          });
        }
      });

      if (audioTracks.length <= 1 || autoEmbedAllAudioTracksEnabled) {
        resolve(audioTracks);
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'yt-downloader-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.6) !important;
        z-index: 99998 !important;
      `;
      document.body.appendChild(backdrop);

      const modal = document.createElement('div');
      modal.className = `yt-sub-modal theme-${appTheme}`;
      
      let trackItemsHtml = '';
      audioTracks.forEach((track, idx) => {
        const isChecked = track.isDefault || idx === 0 ? 'checked' : '';
        trackItemsHtml += `
          <label class="yt-sub-item">
            <input type="checkbox" data-idx="${idx}" ${isChecked}>
            <span>${track.displayName} (${track.language.toUpperCase()})</span>
          </label>
        `;
      });

      modal.innerHTML = `
        <div class="yt-sub-modal-title">${chrome.i18n.getMessage('ui_select_audiotracks') || 'Select Audio Tracks'}</div>
        <div class="yt-sub-modal-desc">${chrome.i18n.getMessage('ui_select_audiotracks_desc') || 'Choose which audio tracks you want to embed in the video:'}</div>
        <div class="yt-sub-list">
          ${trackItemsHtml}
        </div>
        <div class="yt-sub-modal-buttons">
          <button class="yt-sub-btn yt-sub-btn-cancel">${chrome.i18n.getMessage('ui_cancel') || 'Cancel'}</button>
          <button class="yt-sub-btn yt-sub-btn-download">${chrome.i18n.getMessage('ui_confirm') || 'Confirm'}</button>
        </div>
      `;

      document.body.appendChild(modal);

      const cleanup = () => {
        backdrop.remove();
        modal.remove();
      };

      modal.querySelector('.yt-sub-btn-cancel').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      modal.querySelector('.yt-sub-btn-download').addEventListener('click', () => {
        const checkedIdxs = Array.from(modal.querySelectorAll('.yt-sub-item input[type="checkbox"]:checked'))
          .map(el => parseInt(el.getAttribute('data-idx'), 10));
        
        const selected = checkedIdxs.map(idx => audioTracks[idx]);
        cleanup();
        resolve(selected);
      });
    });
  }

  async function triggerDirectDownload(btn, customVidId = null) {
    const vidId = customVidId || getUrlVideoId();
    if (!vidId) return;

    if (btn) btn.style.opacity = '0.5';

    try {
      const data = await new Promise((resolve, reject) => {
        extensionAPI.runtime.sendMessage({ action: 'extract_streams', videoId: vidId }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && res.success) {
            resolve(res.data);
          } else {
            reject(new Error(res ? res.error : 'Unknown extraction error'));
          }
        });
      });

      const allVideoStreams = [...data.muxed, ...data.video];
      const isAudioOnly = directFormat === 'mp3' || directFormat === 'm4a';

      if (isAudioOnly) {
        if (!data.audio || data.audio.length === 0) {
          alert('No audio streams available.');
          if (btn) btn.style.opacity = '1';
          return;
        }
        const targetAudioFormat = (directFormat === 'mp3') ? 'm4a' : directFormat;
        const audioStreams = data.audio.filter(s => getAudioFormat(s) === targetAudioFormat);
        const finalAudioStreams = audioStreams.length > 0 ? audioStreams : data.audio;

        finalAudioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestAudioStream = finalAudioStreams[0];
        
        const audioSize = bestAudioStream.contentLength ? parseInt(bestAudioStream.contentLength, 10) : 0;
        triggerDownloadMux(bestAudioStream.url, audioSize, null, 0, null, data.videoDetails.title, directFormat, data.videoDetails.thumbnail);
      } else {
        if (allVideoStreams.length === 0) {
          alert('No video streams found.');
          if (btn) btn.style.opacity = '1';
          return;
        }

        let videoStreams = allVideoStreams.filter(s => getFormat(s) === directFormat);
        if (videoStreams.length === 0) {
          videoStreams = allVideoStreams; 
        }

        if (directResolution === 'highest') {
          videoStreams.sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0));
        } else if (directResolution === 'lowest') {
          videoStreams.sort((a, b) => (parseInt(a.qualityLabel) || 0) - (parseInt(b.qualityLabel) || 0));
        } else {
          const matchedRes = videoStreams.filter(s => s.qualityLabel === directResolution);
          if (matchedRes.length > 0) {
            videoStreams = matchedRes;
          }
        }

        if (directCodec !== 'any') {
          const matchedCodec = videoStreams.filter(s => getCodec(s) === directCodec);
          if (matchedCodec.length > 0) {
            videoStreams = matchedCodec;
          }
        }

        const stream = videoStreams[0];
        if (!stream) {
          alert('No suitable video stream found.');
          if (btn) btn.style.opacity = '1';
          return;
        }

        const isMuxed = data.muxed.includes(stream);
        const ext = getFormat(stream);
        
        let videoUrl = stream.url;
        let videoSize = stream.contentLength ? parseInt(stream.contentLength, 10) : 0;
        let audioUrl = null;
        let audioSize = 0;
        let subtitleUrl = null;

        if (!isMuxed) {
          if (embedAudioTracksEnabled && data.audio && data.audio.length > 0) {
            let selectedTracks = [];
            if (autoEmbedAllAudioTracksEnabled) {
              const uniqueTracks = new Map();
              data.audio.forEach(s => {
                const key = s.trackId || s.language || s.displayName || 'default';
                if (!uniqueTracks.has(key)) uniqueTracks.set(key, s);
              });
              selectedTracks = Array.from(uniqueTracks.values()).map(s => ({
                key: s.trackId || s.language || s.displayName || 'default',
                displayName: s.displayName || 'Default Audio',
                language: s.language || 'und'
              }));
            } else {
              selectedTracks = await selectAudioTracks(data.audio);
              if (selectedTracks === null) {
                if (btn) btn.style.opacity = '1';
                return;
              }
            }

            const audioTracksToFetch = [];
            const targetFormat = (ext === 'mp4') ? 'm4a' : 'webm';
            selectedTracks.forEach(track => {
              const streams = data.audio.filter(s => (s.trackId || s.language || s.displayName || 'default') === track.key);
              streams.sort((a, b) => {
                const aMatch = getAudioFormat(a) === targetFormat;
                const bMatch = getAudioFormat(b) === targetFormat;
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return (b.bitrate || 0) - (a.bitrate || 0);
              });
              const s = streams[0];
              if (s) {
                audioTracksToFetch.push({
                  url: s.url,
                  size: s.contentLength ? parseInt(s.contentLength, 10) : 0,
                  language: s.language || 'und',
                  name: s.displayName || 'Audio Track'
                });
              }
            });

            audioUrl = audioTracksToFetch.length > 0 ? audioTracksToFetch : null;
          } else {
            const targetFormat = (ext === 'mp4') ? 'm4a' : 'webm';
            const s = data.audio.find(x => getAudioFormat(x) === targetFormat) || data.audio[0];
            audioUrl = s?.url || null;
            audioSize = s?.contentLength ? parseInt(s.contentLength, 10) : 0;
          }
        }

        let selectedSubtitles = [];
        if (embedSubtitlesEnabled && data.subtitles && data.subtitles.length > 0) {
          selectedSubtitles = await selectSubtitles(data.subtitles);
          if (selectedSubtitles === null) {
            if (btn) btn.style.opacity = '1';
            return;
          }
        }

        triggerDownloadMux(videoUrl, videoSize, audioUrl, audioSize, selectedSubtitles, data.videoDetails.title, ext, data.videoDetails.thumbnail);
      }
    } catch (err) {
      console.error('[YT-Downloader] Direct download failed:', err);
      alert('Download error: ' + err.message);
    } finally {
      if (btn) btn.style.opacity = '1';
    }
  }

  function restoreButtons() {
    const activeMetadata = document.querySelector('ytd-watch-metadata') || document.body;
    const shareBtn = findShareButton(activeMetadata);
    if (shareBtn) {
      shareBtn.style.removeProperty('display');
    }
    const saveBtn = findSaveButton(activeMetadata);
    if (saveBtn) {
      saveBtn.style.removeProperty('display');
    }
    const nativeDownloadBtn = findNativeDownloadButton(activeMetadata);
    if (nativeDownloadBtn) {
      nativeDownloadBtn.style.removeProperty('display');
    }
  }

  function removeButton() {
    document.querySelectorAll('.yt-downloader-btn').forEach(btn => btn.remove());
    document.querySelectorAll('.yt-downloader-mini-btn').forEach(btn => btn.remove());
    const dropdown = document.querySelector('.yt-downloader-dropdown');
    if (dropdown) dropdown.remove();
  }

  function getCodec(stream) {
    return getCodecName(stream.mimeType);
  }

  function getFormat(stream) {
    if (stream.mimeType.includes('webm')) return 'webm';
    return 'mp4';
  }

  function getAudioCodec(stream) {
    if (!stream.mimeType) return 'unknown';
    const codecMatch = stream.mimeType.match(/codecs="([^"]+)"/);
    if (codecMatch && codecMatch[1]) {
      const rawCodec = codecMatch[1].split('.')[0];
      if (rawCodec.startsWith('mp4a')) return 'AAC';
      if (rawCodec.startsWith('opus')) return 'Opus';
      return rawCodec;
    }
    return 'unknown';
  }

  function getAudioFormat(stream) {
    if (stream.mimeType.includes('webm')) return 'webm';
    return 'm4a';
  }

  let dropdownEl = null;
  let activeBackdropEl = null;

  function cleanupDropdown() {
    if (dropdownEl) {
      dropdownEl.remove();
      dropdownEl = null;
    }
    if (activeBackdropEl) {
      activeBackdropEl.remove();
      activeBackdropEl = null;
    }
  }

  async function toggleDropdown(btn, customVidId = null, customTitle = null) {
    if (dropdownEl) {
      cleanupDropdown();
      return;
    }

    const vidId = customVidId || getUrlVideoId();
    if (!vidId) return;

    dropdownEl = document.createElement('div');
    dropdownEl.className = `yt-downloader-dropdown theme-${appTheme}`;
    dropdownEl.innerHTML = `<div class="yt-downloader-loading">${chrome.i18n.getMessage('ui_extracting_links') || 'Extracting links...'}</div>`;

    document.body.appendChild(dropdownEl);

    activeBackdropEl = document.createElement('div');
    activeBackdropEl.className = 'yt-downloader-modal-backdrop';
    activeBackdropEl.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.6) !important;
      z-index: 99998 !important;
    `;
    document.body.appendChild(activeBackdropEl);

    activeBackdropEl.addEventListener('click', cleanupDropdown);

    try {
      const data = await new Promise((resolve, reject) => {
        extensionAPI.runtime.sendMessage({ action: 'extract_streams', videoId: vidId }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && res.success) {
            resolve(res.data);
          } else {
            reject(new Error(res ? res.error : 'Unknown extraction error'));
          }
        });
      });
      
      if (!dropdownEl) return; 
      
      dropdownEl.innerHTML = `
        <div class="yt-downloader-dropdown-title">${chrome.i18n.getMessage('ui_download_options') || 'Download Options'}</div>
        
        <div class="yt-downloader-dropdown-field">
          <label>${chrome.i18n.getMessage('ui_type') || 'Type'}</label>
          <select id="yt-select-type">
            <option value="video">${chrome.i18n.getMessage('ui_video_audio') || 'Video & Audio'}</option>
            <option value="audio">${chrome.i18n.getMessage('ui_audio_only') || 'Audio Only'}</option>
          </select>
        </div>

        <div class="yt-downloader-dropdown-field" id="yt-field-format">
          <label>${chrome.i18n.getMessage('ui_format') || 'Format'}</label>
          <select id="yt-select-format"></select>
        </div>

        <div class="yt-downloader-dropdown-field" id="yt-field-resolution">
          <label id="yt-label-resolution">${chrome.i18n.getMessage('ui_resolution') || 'Resolution'}</label>
          <select id="yt-select-resolution"></select>
        </div>

        <div class="yt-downloader-dropdown-field" id="yt-field-codec">
          <label id="yt-label-codec">${chrome.i18n.getMessage('ui_codec') || 'Codec'}</label>
          <select id="yt-select-codec"></select>
        </div>

        <button id="yt-btn-download" class="yt-downloader-action-btn">${chrome.i18n.getMessage('ui_download') || 'Download'}</button>
      `;

      const typeSelect = dropdownEl.querySelector('#yt-select-type');
      const resField = dropdownEl.querySelector('#yt-field-resolution');
      const resLabel = dropdownEl.querySelector('#yt-label-resolution');
      const resSelect = dropdownEl.querySelector('#yt-select-resolution');
      const codecField = dropdownEl.querySelector('#yt-field-codec');
      const codecLabel = dropdownEl.querySelector('#yt-label-codec');
      const codecSelect = dropdownEl.querySelector('#yt-select-codec');
      const formatField = dropdownEl.querySelector('#yt-field-format');
      const formatSelect = dropdownEl.querySelector('#yt-select-format');
      const downloadBtn = dropdownEl.querySelector('#yt-btn-download');

      const allVideoStreams = [...data.muxed, ...data.video];

      function updateOptions(stage) {
        const type = typeSelect.value;

        if (stage <= 1) {
          const prevFormat = formatSelect.value;
          formatSelect.innerHTML = '';
          if (type === 'video') {
            const formats = ['mp4', 'webm'];
            formats.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              opt.textContent = f.toUpperCase();
              formatSelect.appendChild(opt);
            });
            if (formats.includes(prevFormat)) {
              formatSelect.value = prevFormat;
            } else {
              formatSelect.value = 'mp4';
            }
          } else {
            const formats = ['m4a', 'mp3', 'webm'];
            formats.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              opt.textContent = f.toUpperCase();
              formatSelect.appendChild(opt);
            });
            if (formats.includes(prevFormat)) {
              formatSelect.value = prevFormat;
            } else {
              formatSelect.value = 'm4a';
            }
          }
        }

        const selectedFormat = formatSelect.value;

        if (stage <= 2) {
          const prevRes = resSelect.value;
          resSelect.innerHTML = '';

          if (type === 'video') {
            resLabel.textContent = chrome.i18n.getMessage('ui_resolution') || 'Resolution';
            const streamsForFormat = allVideoStreams.filter(s => getFormat(s) === selectedFormat);
            
            const qualities = [];
            streamsForFormat.forEach(s => {
              if (s.qualityLabel && !qualities.includes(s.qualityLabel)) {
                qualities.push(s.qualityLabel);
              }
            });
            qualities.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));

            qualities.forEach(q => {
              const opt = document.createElement('option');
              opt.value = q;
              opt.textContent = q;
              resSelect.appendChild(opt);
            });
            if (qualities.includes(prevRes)) {
              resSelect.value = prevRes;
            } else if (qualities.length > 0) {
              resSelect.value = qualities[0];
            }
          } else {
            resLabel.textContent = chrome.i18n.getMessage('ui_bitrate') || 'Bitrate';
            const targetAudioFormat = (selectedFormat === 'mp3') ? 'm4a' : selectedFormat;
            const streamsForFormat = (data.audio || []).filter(s => getAudioFormat(s) === targetAudioFormat);

            const bitrates = [];
            streamsForFormat.forEach(s => {
              const rate = Math.round(s.bitrate / 1000) + ' kbps';
              if (!bitrates.includes(rate)) {
                bitrates.push(rate);
              }
            });
            bitrates.sort((a, b) => parseInt(b) - parseInt(a));

            bitrates.forEach(b => {
              const opt = document.createElement('option');
              opt.value = b;
              opt.textContent = b;
              resSelect.appendChild(opt);
            });
            if (bitrates.includes(prevRes)) {
              resSelect.value = prevRes;
            } else if (bitrates.length > 0) {
              resSelect.value = bitrates[0];
            }
          }
        }

        const selectedRes = resSelect.value;

        if (stage <= 3) {
          const prevCodec = codecSelect.value;
          codecSelect.innerHTML = '';

          if (type === 'video') {
            const streamsForFormat = allVideoStreams.filter(s => getFormat(s) === selectedFormat);
            const streamsForRes = streamsForFormat.filter(s => s.qualityLabel === selectedRes);
            
            const codecs = [];
            streamsForRes.forEach(s => {
              const codec = getCodec(s);
              if (!codecs.includes(codec)) {
                codecs.push(codec);
              }
            });

            codecs.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c;
              opt.textContent = c;
              codecSelect.appendChild(opt);
            });
            if (codecs.includes(prevCodec)) {
              codecSelect.value = prevCodec;
            } else if (codecs.length > 0) {
              codecSelect.value = codecs[0];
            }
          } else {
            const targetAudioFormat = (selectedFormat === 'mp3') ? 'm4a' : selectedFormat;
            const streamsForFormat = (data.audio || []).filter(s => getAudioFormat(s) === targetAudioFormat);
            const streamsForBitrate = streamsForFormat.filter(s => (Math.round(s.bitrate / 1000) + ' kbps') === selectedRes);

            const codecs = [];
            streamsForBitrate.forEach(s => {
              const codec = getAudioCodec(s);
              if (!codecs.includes(codec)) {
                codecs.push(codec);
              }
            });

            codecs.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c;
              opt.textContent = c;
              codecSelect.appendChild(opt);
            });
            if (codecs.includes(prevCodec)) {
              codecSelect.value = prevCodec;
            } else if (codecs.length > 0) {
              codecSelect.value = codecs[0];
            }
          }
        }

      }
 
      typeSelect.addEventListener('change', () => updateOptions(1));
      formatSelect.addEventListener('change', () => updateOptions(2));
      resSelect.addEventListener('change', () => updateOptions(3));

      updateOptions(1);

      downloadBtn.addEventListener('click', async () => {
        try {
          const type = typeSelect.value;
          const selectedFormat = formatSelect.value;
          const selectedRes = resSelect.value;
          const selectedCodec = codecSelect.value;

          if (type === 'video') {
            const stream = allVideoStreams.find(s => 
              s.qualityLabel === selectedRes && 
              getCodec(s) === selectedCodec && 
              getFormat(s) === selectedFormat
            ) || allVideoStreams.find(s => s.qualityLabel === selectedRes && getFormat(s) === selectedFormat)
              || allVideoStreams.find(s => s.qualityLabel === selectedRes);

            if (!stream) {
              alert('Selected stream format is not available.');
              return;
            }

            const isMuxed = data.muxed.includes(stream);
            const ext = selectedFormat;
            
            let videoUrl = stream.url;
            let videoSize = stream.contentLength ? parseInt(stream.contentLength, 10) : 0;
            let audioUrl = null;
            let audioSize = 0;
            let subtitleUrl = null;

            if (!isMuxed) {
              if (embedAudioTracksEnabled && data.audio && data.audio.length > 0) {
                let selectedTracks = [];
                if (autoEmbedAllAudioTracksEnabled) {
                  const uniqueTracks = new Map();
                  data.audio.forEach(s => {
                    const key = s.trackId || s.language || s.displayName || 'default';
                    if (!uniqueTracks.has(key)) uniqueTracks.set(key, s);
                  });
                  selectedTracks = Array.from(uniqueTracks.values()).map(s => ({
                    key: s.trackId || s.language || s.displayName || 'default',
                    displayName: s.displayName || 'Default Audio',
                    language: s.language || 'und'
                  }));
                } else {
                  selectedTracks = await selectAudioTracks(data.audio);
                  if (selectedTracks === null) return;
                }

                const audioTracksToFetch = [];
                const targetFormat = (selectedFormat === 'mp4') ? 'm4a' : 'webm';
                selectedTracks.forEach(track => {
                  const streams = data.audio.filter(s => (s.trackId || s.language || s.displayName || 'default') === track.key);
                  streams.sort((a, b) => {
                    const aMatch = getAudioFormat(a) === targetFormat;
                    const bMatch = getAudioFormat(b) === targetFormat;
                    if (aMatch && !bMatch) return -1;
                    if (!aMatch && bMatch) return 1;
                    return (b.bitrate || 0) - (a.bitrate || 0);
                  });
                  const s = streams[0];
                  if (s) {
                    audioTracksToFetch.push({
                      url: s.url,
                      size: s.contentLength ? parseInt(s.contentLength, 10) : 0,
                      language: s.language || 'und',
                      name: s.displayName || 'Audio Track'
                    });
                  }
                });

                audioUrl = audioTracksToFetch.length > 0 ? audioTracksToFetch : null;
              } else {
                const targetFormat = (selectedFormat === 'mp4') ? 'm4a' : 'webm';
                const defaultAudio = data.audio.find(x => getAudioFormat(x) === targetFormat) || data.audio[0];
                audioUrl = defaultAudio?.url || null;
                audioSize = defaultAudio?.contentLength ? parseInt(defaultAudio.contentLength, 10) : 0;
              }
            }

            let selectedSubtitles = [];
            if (embedSubtitlesEnabled && data.subtitles && data.subtitles.length > 0) {
              selectedSubtitles = await selectSubtitles(data.subtitles);
              if (selectedSubtitles === null) {
                return;
              }
            }

            triggerDownloadMux(videoUrl, videoSize, audioUrl, audioSize, selectedSubtitles, data.videoDetails.title, ext, data.videoDetails.thumbnail);
          } else {
            
            if (formatSelect.value === 'none') {
              alert('No audio format selected.');
              return;
            }
            const targetFormatMatch = (selectedFormat === 'mp3') ? 'm4a' : selectedFormat;

            if (!data.audio || data.audio.length === 0) {
              alert('No audio streams available.');
              return;
            }

            const bestAudioStream = data.audio.find(s => 
              (Math.round(s.bitrate / 1000) + ' kbps') === selectedRes &&
              getAudioCodec(s) === selectedCodec &&
              getAudioFormat(s) === targetFormatMatch
            ) || data.audio.find(s => 
              (Math.round(s.bitrate / 1000) + ' kbps') === selectedRes &&
              getAudioFormat(s) === targetFormatMatch
            ) || data.audio.find(s => getAudioFormat(s) === targetFormatMatch) || data.audio[0];

            if (!bestAudioStream) {
              alert('Could not find a suitable audio stream.');
              return;
            }

            const audioSize = bestAudioStream.contentLength ? parseInt(bestAudioStream.contentLength, 10) : 0;
            const ext = selectedFormat;
            triggerDownloadMux(bestAudioStream.url, audioSize, null, 0, null, data.videoDetails.title, ext, data.videoDetails.thumbnail);
          }
          cleanupDropdown();
        } catch (err) {
          console.error('[YT-Downloader] Download initiation failed:', err);
          alert('Download error: ' + err.message);
        }
      });

    } catch (err) {
      console.error('[YT-Downloader] Extraction failed:', err);
      if (dropdownEl) {
        dropdownEl.innerHTML = `<div class="yt-downloader-loading" style="color: #ff3e3e;">Failed to extract: ${err.message}</div>`;
      }
    }
  }

  function getCodecName(mimeType) {
    if (!mimeType) return 'unknown';
    const codecMatch = mimeType.match(/codecs="([^"]+)"/);
    if (codecMatch && codecMatch[1]) {
      const rawCodec = codecMatch[1].split('.')[0];
      if (rawCodec.startsWith('avc')) return 'H.264';
      if (rawCodec.startsWith('vp9') || rawCodec.startsWith('vp09')) return 'VP9';
      if (rawCodec.startsWith('av01')) return 'AV1';
      return rawCodec;
    }
    return 'unknown';
  }

  let activeFetches = {};

  function logToPopup(text) {
    chrome.runtime.sendMessage({ action: 'log_from_content', text }).catch(() => {});
  }

  function sanitizeWebVTT(vttText) {
    function tsToSec(ts) {
      const parts = ts.trim().split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      }
      return NaN;
    }

    function secToTs(sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = (sec % 60).toFixed(3);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s.padStart(6,'0')}`;
    }

    function cleanCueText(text) {
      return text
        .replace(/<\d{1,2}:\d{2}[:\d]*\.\d{3}>/g, '')    
        .replace(/<c(?:\.[^>]*)?>|<\/c>/g, '')             
        .replace(/<v(?:\s[^>]*)?>|<\/v>/g, '')             
        .replace(/<lang(?:\s[^>]*)?>|<\/lang>/g, '')       
        .replace(/<ruby>|<\/ruby>|<rt>|<\/rt>/gi, '')      
        .replace(/<b>|<\/b>|<i>|<\/i>|<u>|<\/u>/gi, '')   
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .trim();
    }

    const lines = vttText.split('\n');
    let i = 0;
    const cues = [];

    while (i < lines.length && !lines[i].startsWith('WEBVTT')) i++;
    i++; 

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line === '') { i++; continue; }
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(line)) {
        i++;
        while (i < lines.length && lines[i].trim() !== '') i++;
        continue;
      }

      let tsLine = line;
      if (!line.includes('-->')) {
        
        if (i + 1 < lines.length && lines[i + 1].includes('-->')) {
          i++;
          tsLine = lines[i].trim();
        } else {
          i++;
          continue;
        }
      }

      const tsMatch = tsLine.match(
        /(\d{1,2}(?::\d{2}){1,2}\.\d{3})\s*-->\s*(\d{1,2}(?::\d{2}){1,2}\.\d{3})/
      );
      if (!tsMatch) { i++; continue; }

      const startSec = tsToSec(tsMatch[1]);
      const endSec   = tsToSec(tsMatch[2]);

      i++;
      const payloadLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const cleaned = cleanCueText(lines[i]);
        if (cleaned) payloadLines.push(cleaned);
        i++;
      }

      if (isNaN(startSec) || isNaN(endSec)) continue;
      if (startSec < 0 || endSec < 0) continue;
      if (endSec <= startSec) continue;       
      if (payloadLines.length === 0) continue; 

      const start = Math.max(0, startSec);
      const end   = Math.max(start + 0.04, endSec);

      cues.push({ start, end, text: payloadLines.join('\n') });
    }

    const deduped = cues.filter((c, idx) =>
      idx === 0 || c.text !== cues[idx - 1].text
    );

    const out = ['WEBVTT', ''];
    deduped.forEach((c, idx) => {
      out.push(String(idx + 1));
      out.push(`${secToTs(c.start)} --> ${secToTs(c.end)}`);
      out.push(c.text);
      out.push('');
    });

    return out.join('\n');
  }

  function toIso3(lang) {
    if (!lang) return 'und';
    const code = lang.split('-')[0].toLowerCase();
    const map = {
      'en': 'eng', 'id': 'ind', 'ms': 'may', 'fr': 'fra',
      'de': 'deu', 'es': 'spa', 'it': 'ita', 'ja': 'jpn',
      'ko': 'kor', 'zh': 'zho', 'ru': 'rus', 'ar': 'ara'
    };
    return map[code] || 'und';
  }

  async function bgProbeRange(url) {
    return new Promise((resolve, reject) => {
      extensionAPI.runtime.sendMessage({ action: 'probe_range', url }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res && res.success) resolve(res);
        else reject(new Error(res ? res.error : 'Probe failed'));
      });
    });
  }

  async function bgFetchChunk(url, start, end) {
    return new Promise((resolve, reject) => {
      extensionAPI.runtime.sendMessage({ action: 'fetch_chunk', url, start, end }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res && res.success) resolve(res.arrayBuffer);
        else reject(new Error(res ? res.error : 'Fetch chunk failed'));
      });
    });
  }

  async function bgFetchLinear(url) {
    return new Promise((resolve, reject) => {
      extensionAPI.runtime.sendMessage({ action: 'fetch_linear', url }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res && res.success) resolve(res.arrayBuffer);
        else reject(new Error(res ? res.error : 'Fetch linear failed'));
      });
    });
  }

  async function fetchWithProgress(url, signal, label, knownSize, onProgress) {
    logToPopup(`Fetching ${label}...`);
    const CHUNK_SIZE = 5 * 1024 * 1024; 
    let size = knownSize || 0;

    if (size > 0) {
      logToPopup(`Chunked Range download supported (metadata size) for ${label}. Size: ${(size / 1048576).toFixed(2)} MB`);
      const result = new Uint8Array(size);

      for (let start = 0; start < size; start += CHUNK_SIZE) {
        if (signal.aborted) throw new Error("Aborted");
        const end = Math.min(start + CHUNK_SIZE - 1, size - 1);

        let arrayBuf = null;
        let retries = 3;
        while (retries > 0) {
          try {
            arrayBuf = await bgFetchChunk(url, start, end);
            break;
          } catch (e) {
            if (signal.aborted) throw new Error("Aborted");
          }
          retries--;
          if (retries === 0) throw new Error(`Failed to fetch chunk ${start}-${end}`);
          await new Promise(r => setTimeout(r, 1000));
        }

        const chunkData = new Uint8Array(arrayBuf);
        result.set(chunkData, start);

        onProgress(Math.round(((start + chunkData.length) / size) * 100));
      }

      return result.buffer;
    }

    try {
      const probeRes = await bgProbeRange(url);
      const isChunked = probeRes.isChunked;

      if (isChunked) {
        const contentRange = probeRes.contentRange;
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match) size = parseInt(match[1], 10);
        }
      }

      if (isChunked && size > 0) {
        logToPopup(`Chunked Range download supported (probed size) for ${label}. Size: ${(size / 1048576).toFixed(2)} MB`);
        const result = new Uint8Array(size);

        for (let start = 0; start < size; start += CHUNK_SIZE) {
          if (signal.aborted) throw new Error("Aborted");
          const end = Math.min(start + CHUNK_SIZE - 1, size - 1);

          let arrayBuf = null;
          let retries = 3;
          while (retries > 0) {
            try {
              arrayBuf = await bgFetchChunk(url, start, end);
              break;
            } catch (e) {
              if (signal.aborted) throw new Error("Aborted");
            }
            retries--;
            if (retries === 0) throw new Error(`Failed to fetch chunk ${start}-${end}`);
            await new Promise(r => setTimeout(r, 1000));
          }

          const chunkData = new Uint8Array(arrayBuf);
          result.set(chunkData, start);

          onProgress(Math.round(((start + chunkData.length) / size) * 100));
        }

        return result.buffer;
      }
    } catch (probeErr) {
      logToPopup(`Range probe failed for ${label}, falling back to background linear fetch: ${probeErr.message}`);
    }

    const arrayBuf = await bgFetchLinear(url);
    return arrayBuf;
  }

  async function triggerDownloadMux(videoUrl, videoSize, audioUrl, audioSize, subtitleUrl, title, ext, thumbnail) {
    const cleanTitle = (title || 'video').replace(/[\\/:*?"<>|]/g, '_');
    let filename = `${cleanTitle}.${ext}`;
    
    if (dropdownEl) {
      dropdownEl.remove();
      dropdownEl = null;
    }

    const taskId = 'task-' + Math.random().toString(36).slice(2, 9);
    const controller = new AbortController();
    activeFetches[taskId] = controller;

    if (extensionAPI && extensionAPI.runtime) {
      extensionAPI.runtime.sendMessage({
        action: 'update_progress_broadcast',
        taskId: taskId,
        progress: 0,
        status: 'downloading',
        title: filename,
        thumbnail: thumbnail
      });
    }

    try {
      const isMp4 = ext.toLowerCase() === 'mp4';
      let videoBuffer = null;
      let finalData = null;
      let finalMime = isMp4 ? 'video/mp4' : 'video/webm';

      if (videoUrl) {
        videoBuffer = await fetchWithProgress(videoUrl, controller.signal, "media stream", videoSize, (pct) => {
          const factor = audioUrl ? 0.5 : 0.9;
          if (extensionAPI && extensionAPI.runtime) {
            extensionAPI.runtime.sendMessage({
              action: 'update_progress_broadcast',
              taskId: taskId,
              progress: Math.round(pct * factor)
            });
          }
        });
      }

      let subtitleTracksData = [];
      if (subtitleUrl) {
        const subsArray = Array.isArray(subtitleUrl) 
          ? subtitleUrl 
          : [{ vttUrl: subtitleUrl, displayName: 'English', language: 'en' }];

        for (const sub of subsArray) {
          if (!sub.vttUrl) continue;
          try {
            const arrayBuffer = await bgFetchLinear(sub.vttUrl);
            const rawText = new TextDecoder('utf-8').decode(arrayBuffer);
            const subtitleText = sanitizeWebVTT(rawText);
            logToPopup(`Sanitized VTT for ${sub.displayName || sub.language}: ${subtitleText.length} chars`);
            subtitleTracksData.push({
              text: subtitleText,
              lang: sub.language || 'en',
              name: sub.displayName || 'Subtitles'
            });
          } catch (err) {
            logToPopup(`Failed to fetch subtitle ${sub.displayName || ''}: ${err.message}`);
          }
        }
      }

      const audioBuffers = [];
      if (audioUrl) {
        const audioTracksToFetch = Array.isArray(audioUrl) 
          ? audioUrl 
          : [{ url: audioUrl, size: audioSize || 0, language: 'und', name: 'Default Audio' }];

        for (let i = 0; i < audioTracksToFetch.length; i++) {
          const track = audioTracksToFetch[i];
          logToPopup(`Downloading audio track ${i + 1}/${audioTracksToFetch.length}: ${track.name}...`);
          
          const trackBuf = await fetchWithProgress(track.url, controller.signal, `audio track (${track.name})`, track.size, (pct) => {
            if (extensionAPI && extensionAPI.runtime) {
              const baseProgress = 50;
              const weight = 40 / audioTracksToFetch.length;
              const currentProgress = baseProgress + Math.round((i * weight) + (pct * weight / 100));
              extensionAPI.runtime.sendMessage({
                action: 'update_progress_broadcast',
                taskId: taskId,
                progress: Math.min(90, currentProgress)
              });
            }
          });

          if (controller.signal.aborted) throw new Error("Aborted");

          const view = new DataView(trackBuf);
          let detectedFormat = 'm4a';
          if (view.byteLength >= 4) {
            const signature = view.getUint32(0, false);
            if (signature === 0x1A45DFA3) {
              detectedFormat = 'webm';
            }
          }

          audioBuffers.push({
            buffer: trackBuf,
            language: track.language,
            name: track.name,
            format: detectedFormat
          });
        }
      }

      let detectedVideoFormat = isMp4 ? 'mp4' : 'webm';
      if (videoBuffer) {
        const view = new DataView(videoBuffer);
        if (view.byteLength >= 4) {
          const signature = view.getUint32(0, false);
          if (signature === 0x1A45DFA3) {
            detectedVideoFormat = 'webm';
          } else {
            detectedVideoFormat = 'mp4';
          }
        }
      }

      // Update filename if detected format is different
      const actualExt = videoBuffer ? detectedVideoFormat : ext;
      if (actualExt !== ext) {
        filename = `${cleanTitle}.${actualExt}`;
      }

      if (videoBuffer) {
        try {
          const vArr = new Uint8Array(videoBuffer);
          let vHex = '';
          for (let i = 0; i < Math.min(16, vArr.length); i++) {
            vHex += vArr[i].toString(16).padStart(2, '0') + ' ';
          }
          logToPopup(`Video first 16 bytes: ${vHex.trim()}`);
        } catch (e) {
          logToPopup(`Video log err: ${e.message}`);
        }
      }
      if (audioBuffers && audioBuffers[0]) {
        try {
          const aArr = new Uint8Array(audioBuffers[0].buffer);
          let aHex = '';
          for (let i = 0; i < Math.min(16, aArr.length); i++) {
            aHex += aArr[i].toString(16).padStart(2, '0') + ' ';
          }
          logToPopup(`Audio first 16 bytes: ${aHex.trim()}`);
        } catch (e) {
          logToPopup(`Audio log err: ${e.message}`);
        }
      }

      if (videoBuffer && (audioBuffers.length > 0 || subtitleTracksData.length > 0)) {
        const useMp4AV = (detectedVideoFormat === 'mp4');
        const libavVar = useMp4AV ? 'LibAV_h264' : 'LibAV';
        const libavObj = (libavVar === 'LibAV_h264')
          ? (window.LibAV_h264 || self.LibAV_h264 || globalThis.LibAV_h264)
          : (window.LibAV || self.LibAV || globalThis.LibAV);

        if (!libavObj || !libavObj.LibAV) {
          throw new Error(`LibAV variant ${libavVar} is not loaded (tried window, self, globalThis)`);
        }
        logToPopup(`Initializing LibAV instance for single-run muxing...`);
        const libav = await libavObj.LibAV({
          noworker: true,
          base: chrome.runtime.getURL('libraries')
        });

        const vExt = "." + detectedVideoFormat;
        const vName = "input_video" + vExt;
        const outName = "output" + vExt;

        logToPopup(`Writing video file to virtual MEMFS...`);
        await libav.writeFile(vName, new Uint8Array(videoBuffer));
        videoBuffer = null;

        const ffmpegArgs = ['-y', '-i', vName];
        const tempFiles = [vName];
        let inputIdx = 1;

        const audioFiles = [];
        for (let i = 0; i < audioBuffers.length; i++) {
          const aExt = "." + audioBuffers[i].format;
          const aName = `input_audio_${i}${aExt}`;
          logToPopup(`Writing audio track ${audioBuffers[i].name} to virtual MEMFS...`);
          await libav.writeFile(aName, new Uint8Array(audioBuffers[i].buffer));
          audioBuffers[i].buffer = null;
          tempFiles.push(aName);
          ffmpegArgs.push('-i', aName);
          audioFiles.push({ index: inputIdx++, track: audioBuffers[i] });
        }

        const subtitleFiles = [];
        for (let i = 0; i < subtitleTracksData.length; i++) {
          const sName = `sub_${i}.vtt`;
          logToPopup(`Writing subtitle track ${subtitleTracksData[i].name} to virtual MEMFS...`);
          await libav.writeFile(sName, new TextEncoder().encode(subtitleTracksData[i].text));
          tempFiles.push(sName);
          ffmpegArgs.push('-i', sName);
          subtitleFiles.push({ index: inputIdx++, track: subtitleTracksData[i] });
        }

        ffmpegArgs.push('-map', '0:v:0');

        if (audioFiles.length > 0) {
          for (let i = 0; i < audioFiles.length; i++) {
            ffmpegArgs.push('-map', `${audioFiles[i].index}:a:0`);
          }
        }

        if (subtitleFiles.length > 0) {
          for (let i = 0; i < subtitleFiles.length; i++) {
            ffmpegArgs.push('-map', `${subtitleFiles[i].index}:s:0`);
          }
        }

        ffmpegArgs.push('-c:v', 'copy');
        if (audioFiles.length > 0) {
          ffmpegArgs.push('-c:a', 'copy');
        }
        if (subtitleFiles.length > 0) {
          const sCodec = isMp4 ? 'mov_text' : 'webvtt';
          ffmpegArgs.push('-c:s', sCodec);
        }

        if (audioFiles.length > 0) {
          for (let i = 0; i < audioFiles.length; i++) {
            const lang = audioFiles[i].track.language || 'und';
            const name = audioFiles[i].track.name || `Audio Track ${i + 1}`;
            ffmpegArgs.push(`-metadata:s:a:${i}`, `language=${lang}`);
            ffmpegArgs.push(`-metadata:s:a:${i}`, `title=${name}`);
          }
        }

        if (subtitleFiles.length > 0) {
          for (let i = 0; i < subtitleFiles.length; i++) {
            const lang = toIso3(subtitleFiles[i].track.lang) || 'und';
            const name = subtitleFiles[i].track.name || `Subtitle ${i}`;
            ffmpegArgs.push(`-metadata:s:s:${i}`, `language=${lang}`);
            ffmpegArgs.push(`-metadata:s:s:${i}`, `title=${name}`);
          }
        }

        ffmpegArgs.push(outName);

        if (extensionAPI && extensionAPI.runtime) {
          extensionAPI.runtime.sendMessage({
            action: 'update_progress_broadcast',
            taskId: taskId,
            progress: 92,
            status: 'muxing'
          });
        }

        logToPopup(`Running FFmpeg single-run mux...`);
        const exitCode = await libav.ffmpeg(ffmpegArgs);
        logToPopup(`FFmpeg finished. Exit Code: ${exitCode}`);
        if (exitCode !== 0) {
          throw new Error(`Muxing failed (FFmpeg exit code ${exitCode})`);
        }

        finalData = await libav.readFile(outName);

        for (const file of tempFiles) {
          await libav.unlink(file);
        }
        await libav.unlink(outName);

        try {
          await libav.terminate();
        } catch (e) {
          logToPopup(`LibAV termination warning: ${e.message}`);
        }

        subtitleTracksData = [];
      } else {
        if (videoBuffer) {
          finalData = new Uint8Array(videoBuffer);
        } else if (audioBuffers.length > 0) {
          finalData = new Uint8Array(audioBuffers[0].buffer);
        }
      }

      if (!videoUrl && audioUrl) {
        finalMime = filename.toLowerCase().endsWith('.mp3') ? 'audio/mp3' : (filename.toLowerCase().endsWith('.webm') ? 'audio/webm' : 'audio/x-m4a');
      }

      if (controller.signal.aborted) throw new Error("Aborted");

      if (extensionAPI && extensionAPI.runtime) {
        extensionAPI.runtime.sendMessage({
          action: 'update_progress_broadcast',
          taskId: taskId,
          progress: 99,
          status: 'embedding'
        });

        logToPopup(`Sending final array buffer to background.js for downloads API trigger...`);
        try {
          extensionAPI.runtime.sendMessage({
            action: 'trigger_downloads_api',
            arrayBuffer: finalData.buffer,
            filename: filename,
            taskId: taskId,
            thumbnail: thumbnail
          }, (res) => {
            if (chrome.runtime.lastError || (res && !res.success)) {
              const errorMsg = res ? res.error : (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Disconnected');
              logToPopup(`Downloads API failed: ${errorMsg}. Falling back to anchor click...`);
              triggerAnchorClickDownload(finalData, filename);
              extensionAPI.runtime.sendMessage({
                action: 'remove_active_download',
                taskId: taskId,
                status: 'success',
                filename: filename,
                thumbnail: thumbnail
              });
            } else {
              logToPopup(`Browser download manager successfully triggered.`);
            }
          });
        } catch (sendErr) {
          logToPopup(`Failed to send ArrayBuffer via message channel: ${sendErr.message}. Triggering anchor click download directly...`);
          triggerAnchorClickDownload(finalData, filename);
          extensionAPI.runtime.sendMessage({
            action: 'remove_active_download',
            taskId: taskId,
            status: 'success',
            filename: filename,
            thumbnail: thumbnail
          });
        }
      } else {
        triggerAnchorClickDownload(finalData, filename);
      }

    } catch (err) {
      logToPopup(`Download/Mux failed: ${err.message}`);
      if (extensionAPI && extensionAPI.runtime) {
        extensionAPI.runtime.sendMessage({
          action: 'remove_active_download',
          taskId: taskId,
          status: 'failed',
          filename: filename,
          thumbnail: thumbnail
        });
      }
    } finally {
      delete activeFetches[taskId];
    }
  }

  function triggerAnchorClickDownload(dataBytes, filename) {
    const isMp3 = filename.toLowerCase().endsWith('.mp3');
    const isWebm = filename.toLowerCase().endsWith('.webm');
    const isM4a = filename.toLowerCase().endsWith('.m4a');
    let mime = 'video/mp4';
    if (isMp3) mime = 'audio/mp3';
    else if (isWebm) mime = 'audio/webm';
    else if (isM4a) mime = 'audio/x-m4a';

    const blob = new Blob([dataBytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function detectVideosOnPage() {
    const videos = [];

    const mainId = getUrlVideoId();
    if (mainId) {
      const mainTitleEl = document.querySelector('h1.ytd-watch-metadata') || document.querySelector('h1.title');
      const title = mainTitleEl ? mainTitleEl.textContent.trim() : 'Current Video';
      videos.push({ id: mainId, title: `[Main] ${title}` });
    }

    const playlistRenderers = document.querySelectorAll('ytd-playlist-panel-video-renderer');
    playlistRenderers.forEach(item => {
      const linkEl = item.querySelector('a#wc-endpoint') || item.querySelector('a');
      const titleEl = item.querySelector('#video-title');
      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const match = href.match(/[?&]v=([^&#]*)/);
        if (match) {
          const id = match[1];
          const title = titleEl.textContent.trim();
          
          if (id !== mainId && !videos.some(v => v.id === id)) {
            videos.push({ id: id, title: `[Playlist] ${title}` });
          }
        }
      }
    });

    const watchNextRenderers = document.querySelectorAll('ytd-compact-video-renderer');
    watchNextRenderers.forEach(item => {
      const linkEl = item.querySelector('a#thumbnail');
      const titleEl = item.querySelector('#video-title');
      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const match = href.match(/[?&]v=([^&#]*)/);
        if (match) {
          const id = match[1];
          const title = titleEl.textContent.trim();
          if (id !== mainId && !videos.some(v => v.id === id)) {
            videos.push({ id: id, title: `[Next] ${title}` });
          }
        }
      }
    });

    return videos;
  }

  if (extensionAPI && extensionAPI.runtime) {
    try {
      extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'detect_videos') {
          const detected = detectVideosOnPage();
          sendResponse({ videos: detected });
        } else if (message.action === 'update_settings') {
          loadSettings();
          sendResponse({ status: 'updated' });
        } else if (message.action === 'cancel_active_fetch') {
          const controller = activeFetches[message.taskId];
          if (controller) {
            controller.abort();
            delete activeFetches[message.taskId];
          }
          sendResponse({ success: true });
        } else if (message.action === 'trigger_local_download') {
          try {
            const blob = new Blob([message.arrayBuffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement("a");
            a.href = url;
            a.download = message.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 10000);

            sendResponse({ success: true });
          } catch (err) {
            console.error('Trigger local download failed:', err);
            sendResponse({ success: false, error: err.message });
          }
        }
      });
    } catch (e) {
      console.warn('[YT-Downloader] Message listener failed:', e);
    }
  }

  loadSettings();

  setInterval(runInjectionSync, 1000);
})();
