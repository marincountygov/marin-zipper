(() => {
        "use strict";

        const PASSWORD_MIN_LENGTH = 12;
        const LARGE_FILE_WARNING_BYTES = 2 * 1024 * 1024 * 1024;
        const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
        const DEFAULT_ZIP_FILENAME = "marin-encrypted-files.zip";
        const FILENAME_PARAM_KEYS = ["currentdate", "county", "lastname", "dob"];
        const WINDOWS_RESERVED_FILENAMES = new Set([
          "CON", "PRN", "AUX", "NUL",
          "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
          "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
        ]);

        const state = {
          items: [],
          nextId: 1,
          isBusy: false,
          abortController: null,
          downloadUrl: null,
          dragDepth: 0,
          filenameBuilderActive: false,
          filenameParamKeys: []
        };

        const elements = {
          body: document.body,
          dropzone: document.getElementById("dropzone"),
          chooseFilesButton: document.getElementById("choose-files-button"),
          chooseFolderButton: document.getElementById("choose-folder-button"),
          clearFilesButton: document.getElementById("clear-files-button"),
          fileInput: document.getElementById("file-input"),
          folderInput: document.getElementById("folder-input"),
          fileList: document.getElementById("file-list"),
          emptyFiles: document.getElementById("empty-files"),
          selectedCount: document.getElementById("selected-count"),
          selectedSize: document.getElementById("selected-size"),
          largeFileWarning: document.getElementById("large-file-warning"),
          form: document.getElementById("zip-form"),
          filenameFields: document.getElementById("filename-fields"),
          filenameFieldGroups: Object.fromEntries(FILENAME_PARAM_KEYS.map((key) => [key, document.querySelector(`[data-filename-param="${key}"]`)])),
          filenameInputs: {
            currentdate: document.getElementById("filename-currentdate"),
            county: document.getElementById("filename-county"),
            lastname: document.getElementById("filename-lastname"),
            dob: document.getElementById("filename-dob")
          },
          zipName: document.getElementById("zip-name"),
          zipNameHelp: document.getElementById("zip-name-help"),
          password: document.getElementById("zip-password"),
          passwordConfirm: document.getElementById("zip-password-confirm"),
          passwordHelp: document.getElementById("password-help"),
          generatePasswordButton: document.getElementById("generate-password-button"),
          togglePasswordButton: document.getElementById("toggle-password-button"),
          encryptionStrength: document.getElementById("encryption-strength"),
          compressionLevel: document.getElementById("compression-level"),
          createZipButton: document.getElementById("create-zip-button"),
          cancelButton: document.getElementById("cancel-button"),
          progressWrap: document.getElementById("progress-wrap"),
          progress: document.getElementById("zip-progress"),
          progressText: document.getElementById("progress-text"),
          downloadLink: document.getElementById("download-link"),
          status: document.getElementById("app-status-message")
        };

        if (window.zip?.configure) {
          window.zip.configure({
            useWebWorkers: false,
            useCompressionStream: true
          });
        }

        function setStatus(message, type = "info") {
          elements.status.textContent = message;
          elements.status.className = `app-alert app-alert--${type}`;
        }

        function formatBytes(bytes) {
          if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
          const units = ["bytes", "KB", "MB", "GB", "TB"];
          let value = bytes;
          let unitIndex = 0;
          while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
          }
          const decimals = unitIndex === 0 || value >= 100 ? 0 : 1;
          return `${value.toFixed(decimals)} ${units[unitIndex]}`;
        }

        function formatCurrentDate(date = new Date()) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        }

        function getTotalBytes() {
          return state.items.reduce((sum, item) => sum + (item.file.size || 0), 0);
        }

        function revokeDownloadUrl() {
          if (state.downloadUrl) {
            URL.revokeObjectURL(state.downloadUrl);
            state.downloadUrl = null;
          }
          elements.downloadLink.hidden = true;
          elements.downloadLink.removeAttribute("href");
          elements.downloadLink.removeAttribute("download");
        }

        function triggerDownload(url, filename) {
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.style.display = "none";
          document.body.append(link);
          link.click();
          link.remove();
        }

        function sanitizeZipFileName(value) {
          const trimmed = String(value || DEFAULT_ZIP_FILENAME).trim();
          const withoutUnsafe = trimmed
            .replace(/[<>:"\\|?*\x00-\x1F]/g, "_")
            .replace(/^\.+/, "")
            .trim() || DEFAULT_ZIP_FILENAME;
          return withoutUnsafe.toLowerCase().endsWith(".zip") ? withoutUnsafe : `${withoutUnsafe}.zip`;
        }

        function sanitizeFilenameComponent(value) {
          let clean = String(value || "").trim();
          if (typeof clean.normalize === "function") {
            clean = clean.normalize("NFKC");
          }
          clean = clean
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^[._-]+|[._-]+$/g, "");

          if (WINDOWS_RESERVED_FILENAMES.has(clean.toUpperCase())) {
            clean = `${clean}-file`;
          }
          return clean;
        }

        function buildGeneratedZipFileName() {
          const components = FILENAME_PARAM_KEYS
            .filter((key) => state.filenameParamKeys.includes(key))
            .map((key) => sanitizeFilenameComponent(elements.filenameInputs[key]?.value))
            .filter(Boolean);

          return sanitizeZipFileName(components.length ? `${components.join("_")}.zip` : DEFAULT_ZIP_FILENAME);
        }

        function getOutputZipFileName() {
          return state.filenameBuilderActive ? buildGeneratedZipFileName() : sanitizeZipFileName(elements.zipName.value);
        }

        function syncGeneratedZipName() {
          if (!state.filenameBuilderActive) return;
          elements.zipName.value = buildGeneratedZipFileName();
        }

        function initializeFilenameFields() {
          const params = new URLSearchParams(window.location.search);
          const activeKeys = FILENAME_PARAM_KEYS.filter((key) => params.has(key));

          state.filenameBuilderActive = activeKeys.length > 0;
          state.filenameParamKeys = activeKeys;

          if (!state.filenameBuilderActive) return;

          elements.filenameFields.hidden = false;
          elements.zipName.readOnly = true;
          elements.zipNameHelp.textContent = "Generated from the file name fields shown above.";

          for (const key of FILENAME_PARAM_KEYS) {
            const isActive = activeKeys.includes(key);
            const group = elements.filenameFieldGroups[key];
            const input = elements.filenameInputs[key];
            if (!group || !input) continue;

            group.hidden = !isActive;
            if (!isActive) {
              input.value = "";
              continue;
            }

            if (key === "currentdate") {
              input.value = formatCurrentDate();
            } else {
              const value = params.get(key);
              input.value = value ? value.trim() : "";
            }
          }

          syncGeneratedZipName();
        }

        function sanitizeEntrySegment(segment, fallback = "file") {
          const clean = String(segment || "")
            .replace(/[<>:"\\|?*\x00-\x1F]/g, "_")
            .replace(/\s+/g, " ")
            .trim();
          return clean && clean !== "." && clean !== ".." ? clean : fallback;
        }

        function normalizeEntryPath(path) {
          const value = String(path || "file")
            .replace(/\\/g, "/")
            .replace(/^[a-zA-Z]:\//, "")
            .replace(/^\/+/, "");
          const parts = value
            .split("/")
            .map((part) => sanitizeEntrySegment(part, ""))
            .filter(Boolean);
          return parts.join("/") || "file";
        }

        function makeUniqueEntryPath(path, usedPaths) {
          const normalizedPath = normalizeEntryPath(path);
          if (!usedPaths.has(normalizedPath)) {
            usedPaths.add(normalizedPath);
            return normalizedPath;
          }

          const slashIndex = normalizedPath.lastIndexOf("/");
          const folder = slashIndex >= 0 ? `${normalizedPath.slice(0, slashIndex + 1)}` : "";
          const filename = slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) : normalizedPath;
          const dotIndex = filename.lastIndexOf(".");
          const hasExtension = dotIndex > 0;
          const base = hasExtension ? filename.slice(0, dotIndex) : filename;
          const extension = hasExtension ? filename.slice(dotIndex) : "";

          let counter = 2;
          let candidate = `${folder}${base} (${counter})${extension}`;
          while (usedPaths.has(candidate)) {
            counter += 1;
            candidate = `${folder}${base} (${counter})${extension}`;
          }
          usedPaths.add(candidate);
          return candidate;
        }

        function updateValidation() {
          if (state.filenameBuilderActive) syncGeneratedZipName();

          const password = elements.password.value;
          const confirmation = elements.passwordConfirm.value;
          const hasFiles = state.items.length > 0;
          const hasZipName = getOutputZipFileName().trim().length > 0;
          const passwordLongEnough = password.length >= PASSWORD_MIN_LENGTH;
          const passwordsMatch = password === confirmation;
          const canCreate = hasFiles && hasZipName && passwordLongEnough && passwordsMatch && !state.isBusy && Boolean(window.zip);

          elements.passwordConfirm.setCustomValidity(passwordsMatch ? "" : "Passwords must match.");
          elements.password.setCustomValidity(passwordLongEnough || !password ? "" : `Must be at least ${PASSWORD_MIN_LENGTH} characters.`);
          elements.passwordHelp.textContent = passwordsMatch
            ? `Must be at least ${PASSWORD_MIN_LENGTH} characters. Passwords are not stored by this page.`
            : "Passwords must match.";
          elements.passwordHelp.classList.toggle("app-error", !passwordsMatch);
          elements.createZipButton.disabled = !canCreate;
          elements.clearFilesButton.disabled = !hasFiles || state.isBusy;
          elements.chooseFilesButton.disabled = state.isBusy;
          elements.chooseFolderButton.disabled = state.isBusy;
          elements.zipName.disabled = state.isBusy;
          elements.password.disabled = state.isBusy;
          elements.passwordConfirm.disabled = state.isBusy;
          elements.encryptionStrength.disabled = state.isBusy;
          elements.compressionLevel.disabled = state.isBusy;
          Object.values(elements.filenameInputs).forEach((input) => {
            if (input) input.disabled = state.isBusy;
          });
          elements.generatePasswordButton.disabled = state.isBusy;
          elements.togglePasswordButton.disabled = state.isBusy;
          elements.cancelButton.hidden = !state.isBusy;
        }

        function renderFiles() {
          const totalBytes = getTotalBytes();
          elements.fileList.innerHTML = "";
          elements.emptyFiles.hidden = state.items.length > 0;
          elements.selectedCount.textContent = `${state.items.length.toLocaleString()} ${state.items.length === 1 ? "file" : "files"}`;
          elements.selectedSize.textContent = formatBytes(totalBytes);
          elements.largeFileWarning.hidden = totalBytes < LARGE_FILE_WARNING_BYTES;

          const fragment = document.createDocumentFragment();
          for (const item of state.items) {
            const row = document.createElement("div");
            row.className = "zip-file-row";
            row.dataset.fileId = String(item.id);

            const name = document.createElement("div");
            name.className = "zip-file-name";
            name.textContent = item.path;

            const meta = document.createElement("div");
            meta.className = "zip-file-meta";
            meta.textContent = formatBytes(item.file.size || 0);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "secondary zip-remove-file";
            remove.textContent = "Remove";
            remove.disabled = state.isBusy;
            remove.setAttribute("aria-label", `Remove ${item.path}`);
            remove.addEventListener("click", () => removeFile(item.id));

            row.append(name, meta, remove);
            fragment.append(row);
          }
          elements.fileList.append(fragment);
          updateValidation();
        }

        function addFiles(items) {
          const incoming = items.filter((item) => item && item.file instanceof File);
          if (!incoming.length) return;
          revokeDownloadUrl();

          const existingKeys = new Set(state.items.map((item) => `${item.path}|${item.file.size}|${item.file.lastModified}`));
          let addedCount = 0;

          for (const incomingItem of incoming) {
            const path = normalizeEntryPath(incomingItem.path || incomingItem.file.webkitRelativePath || incomingItem.file.name);
            const key = `${path}|${incomingItem.file.size}|${incomingItem.file.lastModified}`;
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            state.items.push({
              id: state.nextId,
              file: incomingItem.file,
              path
            });
            state.nextId += 1;
            addedCount += 1;
          }

          renderFiles();
          if (addedCount) {
            setStatus(`Added ${addedCount.toLocaleString()} ${addedCount === 1 ? "file" : "files"}.`, "success");
          } else {
            setStatus("Those files were already selected.", "warning");
          }
        }

        function removeFile(id) {
          state.items = state.items.filter((item) => item.id !== id);
          revokeDownloadUrl();
          renderFiles();
          setStatus("File removed.", "info");
        }

        function clearFiles() {
          state.items = [];
          revokeDownloadUrl();
          renderFiles();
          setStatus("File list cleared.", "info");
        }

        function filesFromInput(fileList) {
          return Array.from(fileList || []).map((file) => ({
            file,
            path: file.webkitRelativePath || file.name
          }));
        }

        function readEntries(directoryReader) {
          return new Promise((resolve, reject) => {
            directoryReader.readEntries(resolve, reject);
          });
        }

        function getFileFromEntry(fileEntry) {
          return new Promise((resolve, reject) => {
            fileEntry.file(resolve, reject);
          });
        }

        async function traverseEntry(entry, parentPath, output) {
          if (!entry) return;
          if (entry.isFile) {
            const file = await getFileFromEntry(entry);
            output.push({ file, path: `${parentPath}${file.name}` });
            return;
          }
          if (entry.isDirectory) {
            const reader = entry.createReader();
            const directoryPath = `${parentPath}${entry.name}/`;
            while (true) {
              const entries = await readEntries(reader);
              if (!entries.length) break;
              for (const childEntry of entries) {
                await traverseEntry(childEntry, directoryPath, output);
              }
            }
          }
        }

        async function filesFromDrop(dataTransfer) {
          const items = Array.from(dataTransfer.items || []);
          const supportsEntries = items.some((item) => typeof item.webkitGetAsEntry === "function");
          if (!supportsEntries) return filesFromInput(dataTransfer.files);

          const output = [];
          for (const item of items) {
            if (item.kind !== "file") continue;
            const entry = item.webkitGetAsEntry();
            if (entry) await traverseEntry(entry, "", output);
          }
          return output.length ? output : filesFromInput(dataTransfer.files);
        }

        function hasFilesInDrag(event) {
          return Array.from(event.dataTransfer?.types || []).includes("Files");
        }

        function setDragActive(active) {
          elements.body.classList.toggle("is-dragging", active);
          elements.dropzone.dataset.active = String(active);
        }

        function resetDragState() {
          state.dragDepth = 0;
          setDragActive(false);
        }

        function updateProgress(value, max, text) {
          const safeMax = Math.max(max, 1);
          const safeValue = Math.min(Math.max(value, 0), safeMax);
          const percent = Math.round((safeValue / safeMax) * 100);
          elements.progress.max = safeMax;
          elements.progress.value = safeValue;
          elements.progressText.textContent = `${percent}% - ${text}`;
        }

        function generatePassword(length = 24) {
          if (!globalThis.crypto?.getRandomValues) {
            throw new Error("This browser does not provide crypto.getRandomValues().");
          }
          const randomValues = new Uint32Array(length);
          globalThis.crypto.getRandomValues(randomValues);
          return Array.from(randomValues, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
        }

        async function createEncryptedZip(event) {
          event.preventDefault();

          if (!window.zip) {
            setStatus("zip.js did not load. Check assets/vendor/zip.js/zip-native.min.js.", "danger");
            return;
          }

          updateValidation();
          if (elements.createZipButton.disabled) {
            elements.form.reportValidity();
            return;
          }

          const password = elements.password.value;
          const encryptionStrength = Number(elements.encryptionStrength.value);
          const compressionLevel = Number(elements.compressionLevel.value);
          const zipFileName = getOutputZipFileName();
          const totalBytes = getTotalBytes();
          const usedPaths = new Set();
          let completedBytes = 0;
          let writer = null;

          revokeDownloadUrl();
          state.isBusy = true;
          state.abortController = new AbortController();
          elements.progressWrap.hidden = false;
          updateProgress(0, totalBytes, "Preparing ZIP...");
          setStatus("Creating encrypted ZIP...", "info");
          renderFiles();

          try {
            writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"), {
              bufferedWrite: false,
              keepOrder: true,
              zip64: true
            });

            for (const item of state.items) {
              const entryName = makeUniqueEntryPath(item.path, usedPaths);
              const fileSize = item.file.size || 0;
              const lastModDate = item.file.lastModified ? new Date(item.file.lastModified) : new Date();

              await writer.add(entryName, new zip.BlobReader(item.file), {
                password,
                encryptionStrength,
                level: compressionLevel,
                lastModDate,
                signal: state.abortController.signal,
                onprogress(index, max) {
                  const currentMax = max || fileSize || 1;
                  const currentValue = Math.min(index || 0, currentMax);
                  updateProgress(completedBytes + currentValue, Math.max(totalBytes, 1), `Encrypting ${entryName}`);
                }
              });

              completedBytes += fileSize;
              updateProgress(completedBytes, Math.max(totalBytes, 1), `Encrypted ${entryName}`);
              await new Promise((resolve) => requestAnimationFrame(resolve));
            }

            updateProgress(Math.max(totalBytes, 1), Math.max(totalBytes, 1), "Finalizing ZIP...");
            const blob = await writer.close();
            writer = null;

            state.downloadUrl = URL.createObjectURL(blob);
            elements.downloadLink.href = state.downloadUrl;
            elements.downloadLink.download = zipFileName;
            elements.downloadLink.hidden = false;
            triggerDownload(state.downloadUrl, zipFileName);
            setStatus(`Encrypted ZIP created and download started: ${zipFileName} (${formatBytes(blob.size)}).`, "success");
          } catch (error) {
            const wasCancelled = state.abortController?.signal.aborted || error?.name === "AbortError";
            setStatus(wasCancelled ? "ZIP creation cancelled." : `Could not create ZIP: ${error?.message || error}`, wasCancelled ? "warning" : "danger");
          } finally {
            state.isBusy = false;
            state.abortController = null;
            elements.progressWrap.hidden = true;
            renderFiles();
            if (writer) {
              try {
                await writer.close();
              } catch {
                // Ignore cleanup errors. No partial download URL is exposed.
              }
            }
          }
        }

        elements.chooseFilesButton.addEventListener("click", () => elements.fileInput.click());
        elements.chooseFolderButton.addEventListener("click", () => elements.folderInput.click());
        elements.fileInput.addEventListener("change", () => {
          addFiles(filesFromInput(elements.fileInput.files));
          elements.fileInput.value = "";
        });
        elements.folderInput.addEventListener("change", () => {
          addFiles(filesFromInput(elements.folderInput.files));
          elements.folderInput.value = "";
        });
        elements.clearFilesButton.addEventListener("click", clearFiles);

        elements.form.addEventListener("submit", createEncryptedZip);
        elements.cancelButton.addEventListener("click", () => {
          state.abortController?.abort();
        });

        elements.generatePasswordButton.addEventListener("click", () => {
          try {
            const password = generatePassword();
            elements.password.value = password;
            elements.passwordConfirm.value = password;
            updateValidation();
            setStatus("Password generated. Copy it to a secure location before sharing the ZIP.", "warning");
            elements.password.focus();
            elements.password.select();
          } catch (error) {
            setStatus(error.message, "danger");
          }
        });

        elements.togglePasswordButton.addEventListener("click", () => {
          const shouldShow = elements.password.type === "password";
          elements.password.type = shouldShow ? "text" : "password";
          elements.passwordConfirm.type = shouldShow ? "text" : "password";
          elements.togglePasswordButton.textContent = shouldShow ? "Hide passwords" : "Show passwords";
          elements.togglePasswordButton.setAttribute("aria-pressed", String(shouldShow));
        });

        [elements.zipName, elements.password, elements.passwordConfirm].forEach((input) => {
          input.addEventListener("input", () => {
            revokeDownloadUrl();
            updateValidation();
          });
        });

        Object.values(elements.filenameInputs).forEach((input) => {
          if (!input) return;
          input.addEventListener("input", () => {
            revokeDownloadUrl();
            syncGeneratedZipName();
            updateValidation();
          });
        });

        [elements.encryptionStrength, elements.compressionLevel].forEach((select) => {
          select.addEventListener("change", () => {
            revokeDownloadUrl();
            updateValidation();
          });
        });

        window.addEventListener("dragenter", (event) => {
          if (!hasFilesInDrag(event) || state.isBusy) return;
          event.preventDefault();
          state.dragDepth += 1;
          setDragActive(true);
        });

        window.addEventListener("dragover", (event) => {
          if (!hasFilesInDrag(event) || state.isBusy) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragActive(true);
        });

        window.addEventListener("dragleave", (event) => {
          if (!hasFilesInDrag(event) || state.isBusy) return;
          state.dragDepth = Math.max(0, state.dragDepth - 1);
          if (state.dragDepth === 0) setDragActive(false);
        });

        window.addEventListener("drop", async (event) => {
          if (!hasFilesInDrag(event) || state.isBusy) return;
          event.preventDefault();
          resetDragState();
          try {
            const droppedFiles = await filesFromDrop(event.dataTransfer);
            addFiles(droppedFiles);
          } catch (error) {
            setStatus(`Could not read dropped files: ${error?.message || error}`, "danger");
          }
        });

        window.addEventListener("blur", resetDragState);
        window.addEventListener("beforeunload", revokeDownloadUrl);

        initializeFilenameFields();

        if (!window.zip) {
          setStatus("zip.js did not load. The ZIP tool is unavailable until the script path is fixed.", "danger");
        }
        renderFiles();
      })();
