/*
    youtube-media-downloader - A versatile tool to detect and download YouTube videos, audio, and subtitles.
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

if (typeof browser === 'undefined') {
    var browser = chrome;
}

const DB_NAME = "YTD_DownloadsDB";
const STORE_NAME = "downloads";
const CHUNK_STORE_NAME = "download-chunks";

function openCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 3);
        request.onerror = (event) => reject(event.target.error || "IDB Open Error");
        request.onsuccess = (event) => resolve(event.target.result);
    });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'triggerOffscreenDownload') {
        const { taskId, filename } = message.data;
        console.log("Offscreen received triggerOffscreenDownload for taskId:", taskId, "filename:", filename);
        handleOffscreenDownload(taskId, filename)
            .then(() => {
                console.log("Offscreen download process completed successfully.");
                sendResponse({ success: true });
            })
            .catch((error) => {
                console.error("Offscreen download process failed:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

async function handleOffscreenDownload(taskId, filename) {
    try {
        console.log("Opening database...");
        const db = await openCacheDB();

        console.log("Fetching task metadata from downloads store...");
        const item = await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(taskId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (!item) throw new Error("Download metadata not found in database");
        console.log("Task metadata retrieved:", item);

        console.log("Fetching all chunks from download-chunks store...");
        const chunks = [];
        await new Promise((resolve, reject) => {
            const tx = db.transaction([CHUNK_STORE_NAME], "readonly");
            const store = tx.objectStore(CHUNK_STORE_NAME);
            const range = IDBKeyRange.bound([taskId, 0], [taskId, Infinity]);
            const request = store.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    chunks.push({ index: cursor.value.chunkIndex, data: cursor.value.data });
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });

        if (chunks.length === 0) throw new Error("No chunks found for download");
        console.log("Retrieved", chunks.length, "chunks. Sorting chunks...");
        chunks.sort((a, b) => a.index - b.index);

        console.log("Creating unified Blob...");
        const finalBlob = new Blob(chunks.map(c => c.data), { type: item.mimeType || "application/octet-stream" });
        const mimeType = item.mimeType || finalBlob.type || "";
        filename = ensureFileExtension(filename, mimeType);
        console.log("Final Blob created. Size:", finalBlob.size, "bytes. MimeType:", mimeType);

        console.log("Creating Object URL...");
        const objectUrl = URL.createObjectURL(finalBlob);

        try {
            console.log("Calling chrome.downloads.download API...");
            await browser.downloads.download({
                url: objectUrl,
                filename: filename,
                saveAs: false
            });
            console.log("chrome.downloads.download started for:", filename);

            setTimeout(() => {
                console.log("Revoking Object URL...");
                URL.revokeObjectURL(objectUrl);
            }, 60000);
        } catch (e) {
            URL.revokeObjectURL(objectUrl);
            throw e;
        }

    } catch (error) {
        console.error("Offscreen download failed in handler:", error);
        throw error;
    }
}

function getExtFromMime(mimeType) {
    if (!mimeType) return "";
    const mimeLower = mimeType.toLowerCase().trim();
    
    if (mimeLower.includes("video/mp4")) return ".mp4";
    if (mimeLower.includes("video/webm")) return ".webm";
    if (mimeLower.includes("video/ogg")) return ".ogg";
    if (mimeLower.includes("video/quicktime")) return ".mov";
    if (mimeLower.includes("video/x-matroska")) return ".mkv";
    if (mimeLower.includes("video/x-msvideo")) return ".avi";
    if (mimeLower.includes("video/x-flv")) return ".flv";
    if (mimeLower.includes("video/3gpp")) return ".3gp";
    
    if (mimeLower.includes("audio/mpeg") || mimeLower.includes("audio/mp3")) return ".mp3";
    if (mimeLower.includes("audio/wav") || mimeLower.includes("audio/x-wav")) return ".wav";
    if (mimeLower.includes("audio/webm")) return ".webm";
    if (mimeLower.includes("audio/ogg") || mimeLower.includes("audio/opus")) return ".ogg";
    if (mimeLower.includes("audio/aac")) return ".aac";
    if (mimeLower.includes("audio/flac")) return ".flac";
    if (mimeLower.includes("audio/x-m4a") || mimeLower.includes("audio/m4a") || mimeLower.includes("audio/mp4")) return ".m4a";
    
    if (mimeLower.includes("image/jpeg") || mimeLower.includes("image/jpg")) return ".jpg";
    if (mimeLower.includes("image/png")) return ".png";
    if (mimeLower.includes("image/gif")) return ".gif";
    if (mimeLower.includes("image/webp")) return ".webp";
    if (mimeLower.includes("image/svg+xml")) return ".svg";
    
    if (mimeLower.includes("application/zip")) return ".zip";
    if (mimeLower.includes("application/pdf")) return ".pdf";
    if (mimeLower.includes("text/vtt")) return ".vtt";
    if (mimeLower.includes("application/x-subrip")) return ".srt";
    
    if (mimeLower.startsWith("video/")) {
        const sub = mimeLower.substring(6);
        if (/^[a-z0-9]+$/.test(sub)) return "." + sub;
    }
    if (mimeLower.startsWith("audio/")) {
        const sub = mimeLower.substring(6);
        if (/^[a-z0-9]+$/.test(sub)) {
            if (sub === "mpeg") return ".mp3";
            return "." + sub;
        }
    }
    if (mimeLower.startsWith("image/")) {
        const sub = mimeLower.substring(6);
        if (/^[a-z0-9]+$/.test(sub)) return "." + sub;
    }

    return "";
}

function ensureFileExtension(filename, mimeType) {
    if (!filename) return filename;
    filename = filename.trim();
    
    const hasExtension = /\.[a-zA-Z0-9]{1,5}$/.test(filename);
    if (hasExtension) {
        return filename;
    }
    
    const ext = getExtFromMime(mimeType);
    if (ext) {
        return filename + ext;
    }
    
    return filename;
}
