// Where lessons come from: the course that ships with the app (lessons/,
// listed in lessons/index.json) and folders on this computer that you add.
// A folder is read where it is, never copied, so editing a lesson in VS
// Code or a piece in MuseScore shows up here. Folders are remembered
// (their handles live in IndexedDB); after a restart the browser may ask
// once to let the app read them again.
(function () {
  const LESSON = /\.md$/i;
  const PIECE = /\.(musicxml|xml|mxl|mid|midi|abc)$/i;
  const BOOK = /\.pdf$/i;
  const SKIP = /^(\.|node_modules$)/;

  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("piano-library", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("folders", { keyPath: "id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function store(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("folders", mode);
      const req = fn(tx.objectStore("folders"));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  function create({ base = "lessons/" } = {}) {
    const folders = new Map(); // id → { id, name, handle, files: Map path → File (for the no-handle fallback) }
    let builtin = null;

    async function loadFolders() {
      try {
        const all = (await store("readonly", (s) => s.getAll())) || [];
        for (const f of all) folders.set(f.id, f);
      } catch (e) { /* private window or blocked storage: folders aren't remembered */ }
    }

    async function loadBuiltin() {
      try {
        const r = await fetch(base + "index.json", { cache: "no-cache" });
        builtin = r.ok ? await r.json() : { courses: [] };
      } catch (e) { builtin = { courses: [] }; }
    }

    const canPick = () => typeof window.showDirectoryPicker === "function";

    async function permission(handle, ask, write) {
      if (!handle.queryPermission) return "granted";
      const opts = { mode: write ? "readwrite" : "read" };
      let p = await handle.queryPermission(opts);
      if (p !== "granted" && ask) p = await handle.requestPermission(opts);
      return p;
    }

    async function walk(dir, prefix, out, depth) {
      if (depth > 4) return;
      for await (const [name, h] of dir.entries()) {
        if (SKIP.test(name)) continue;
        const path = prefix + name;
        if (h.kind === "directory") await walk(h, path + "/", out, depth + 1);
        else if (LESSON.test(name) || PIECE.test(name) || BOOK.test(name)) out.push(path);
      }
    }

    function sortFiles(paths) {
      const by = window.Piano.lesson.byName;
      return {
        lessons: paths.filter((p) => LESSON.test(p) && !/(^|\/)readme\.md$/i.test(p)).sort(by),
        pieces: paths.filter((p) => PIECE.test(p)).sort(by),
        books: paths.filter((p) => BOOK.test(p)).sort(by),
      };
    }

    async function list() {
      if (!builtin) await Promise.all([loadBuiltin(), loadFolders()]);
      const out = [];
      for (const c of builtin.courses || []) {
        out.push({ id: "builtin:" + c.id, title: c.title, kind: "builtin", status: "ok", ...sortFiles(c.files.map((f) => c.id + "/" + f)) });
      }
      for (const f of folders.values()) {
        if (f.files) { out.push({ id: f.id, title: f.name, kind: "folder", status: "ok", ...sortFiles([...f.files.keys()]) }); continue; }
        let status = "ok", paths = [];
        try {
          status = (await permission(f.handle, false)) === "granted" ? "ok" : "needs-permission";
          if (status === "ok") await walk(f.handle, "", paths, 0);
        } catch (e) { status = "missing"; }
        out.push({ id: f.id, title: f.name, kind: "folder", status, ...sortFiles(paths) });
      }
      return out;
    }

    async function addFolder() {
      if (!canPick()) return null;
      const handle = await window.showDirectoryPicker({ id: "piano-lessons", mode: "readwrite" });
      for (const f of folders.values()) if (f.handle && (await f.handle.isSameEntry(handle))) return f.id;
      const id = "folder:" + Date.now().toString(36);
      const rec = { id, name: handle.name, handle };
      folders.set(id, rec);
      try { await store("readwrite", (s) => s.put(rec)); } catch (e) { /* remembered for this session only */ }
      return id;
    }

    // Without the folder picker: files picked through <input webkitdirectory>,
    // kept for this session.
    function addFiles(fileList) {
      const files = new Map();
      let name = "Folder";
      for (const file of fileList) {
        const rel = file.webkitRelativePath || file.name;
        const parts = rel.split("/");
        if (parts.length > 1) { name = parts[0]; parts.shift(); }
        files.set(parts.join("/"), file);
      }
      const id = "files:" + Date.now().toString(36);
      folders.set(id, { id, name, files });
      return id;
    }

    async function reconnect(id) {
      const f = folders.get(id);
      return f && f.handle ? (await permission(f.handle, true)) === "granted" : false;
    }

    async function removeFolder(id) {
      folders.delete(id);
      try { await store("readwrite", (s) => s.delete(id)); } catch (e) { /* not stored */ }
    }

    async function fileHandle(dir, path, create) {
      const parts = path.split("/");
      let d = dir;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
      return d.getFileHandle(parts[parts.length - 1], { create });
    }

    // { data, modified }: text, or bytes for .mxl, .mid and .pdf.
    async function read(courseId, path, as = "text") {
      if (courseId.startsWith("builtin:")) {
        const r = await fetch(base + path.split("/").map(encodeURIComponent).join("/"), { cache: "no-cache" });
        if (!r.ok) throw new Error("couldn't open " + path);
        const data = as === "bytes" ? new Uint8Array(await r.arrayBuffer()) : await r.text();
        return { data, modified: 0 };
      }
      const f = folders.get(courseId);
      if (!f) throw new Error("that folder isn't in the library any more");
      const file = f.files ? f.files.get(path) : await (await fileHandle(f.handle, path, false)).getFile();
      if (!file) throw new Error("couldn't open " + path);
      const data = as === "bytes" ? new Uint8Array(await file.arrayBuffer()) : await file.text();
      return { data, modified: file.lastModified };
    }

    async function modified(courseId, path) {
      const f = folders.get(courseId);
      if (!f || !f.handle) return 0;
      try { return (await (await fileHandle(f.handle, path, false)).getFile()).lastModified; } catch (e) { return 0; }
    }

    // Writes a file in a folder course (the lesson editor, progress). The
    // shipped course can't be written to.
    async function write(courseId, path, data) {
      const f = folders.get(courseId);
      if (!f || !f.handle) throw new Error("only lessons in your own folders can be saved");
      if ((await permission(f.handle, true, true)) !== "granted") throw new Error("the app wasn't allowed to save in " + f.name);
      const h = await fileHandle(f.handle, path, true);
      const w = await h.createWritable();
      await w.write(data);
      await w.close();
    }

    const writable = (courseId) => { const f = folders.get(courseId); return !!(f && f.handle); };

    return { list, addFolder, addFiles, reconnect, removeFolder, read, modified, write, writable, canPick };
  }

  window.Piano = window.Piano || {};
  window.Piano.library = { create };
})();
