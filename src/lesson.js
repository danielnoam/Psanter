// Lesson files: Markdown with a front matter block, ```abc practice blocks
// and links to pieces. Pure text in, plain data out; app.js renders it.
//
//   ---
//   title: C major scale
//   book: method-book.pdf#page=24
//   ---
//   ```abc practice: tempo=60 hands=both mode=wait loop=true
//   ...ABC...
//   ```
//   [Minuet in G](pieces/minuet.musicxml "practice tempo=72 hands=right")
(function () {
  const PIECE = /\.(musicxml|xml|mxl|mid|midi|abc)$/i;

  function frontMatter(text) {
    const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "");
    }
    return { meta, body: text.slice(m[0].length) };
  }

  // "practice: tempo=60 hands=left mode=flow loop=true" → options. Unknown
  // keys are kept, so a later version can read them.
  function options(text) {
    const out = {};
    const s = String(text || "").replace(/^\s*practice\s*:?/i, "");
    for (const m of s.matchAll(/([A-Za-z][\w-]*)\s*=\s*("[^"]*"|\S+)/g)) out[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, "");
    const o = {};
    if (out.tempo && /^\d+(\.\d+)?%?$/.test(out.tempo)) o.tempo = parseFloat(out.tempo);
    if (out.speed && /^\d+(\.\d+)?%?$/.test(out.speed)) o.speed = parseFloat(out.speed) / (out.speed.endsWith("%") || parseFloat(out.speed) > 3 ? 100 : 1);
    if (["both", "left", "right"].includes(out.hands)) o.hands = out.hands;
    if (["wait", "flow"].includes(out.mode)) o.mode = out.mode;
    if (out.loop) o.loop = out.loop === "true" || out.loop === "yes";
    if (out.bars && /^\d+(-\d+)?$/.test(out.bars)) { const [a, b] = out.bars.split("-").map(Number); o.bars = [a, b || a]; }
    if (out.metronome) o.metronome = out.metronome === "true" || out.metronome === "on";
    if (out.transpose && /^[+-]?\d+$/.test(out.transpose)) o.transpose = parseInt(out.transpose, 10);
    return { ...out, ...o };
  }

  // A fence's info string: "abc practice: tempo=60" → {lang: "abc", practice: true, opts}.
  function fence(info) {
    const [lang, ...rest] = String(info || "").trim().split(/\s+/);
    const restText = rest.join(" ");
    return { lang: (lang || "").toLowerCase(), practice: /^practice\b/i.test(restText) || lang === "abc", opts: options(restText) };
  }

  const isPiece = (href) => PIECE.test(String(href || "").split(/[?#]/)[0]);
  const kind = (href) => {
    const ext = (/\.([a-z0-9]+)$/i.exec(String(href).split(/[?#]/)[0]) || [])[1] || "";
    return { musicxml: "musicxml", xml: "musicxml", mxl: "mxl", mid: "midi", midi: "midi", abc: "abc" }[ext.toLowerCase()] || null;
  };

  // "book.pdf#page=24" → {file, page}.
  function bookRef(s) {
    if (!s) return null;
    const [file, hash = ""] = String(s).split("#");
    const page = /page=(\d+)/.exec(hash);
    return { file, page: page ? parseInt(page[1], 10) : 1 };
  }

  // Resolves a link in a lesson against the lesson's own folder.
  function resolve(base, href) {
    if (/^[a-z]+:/i.test(href) || href.startsWith("/")) return href.replace(/^\//, "");
    const parts = base.split("/"); parts.pop();
    for (const seg of href.split("/")) {
      if (seg === "..") parts.pop(); else if (seg && seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }

  // A lesson's title: front matter, else its first heading, else its file name.
  function title(meta, body, file) {
    if (meta.title) return meta.title;
    const h = /^#\s+(.+)$/m.exec(body);
    if (h) return h[1].trim();
    return String(file || "").split("/").pop().replace(/\.md$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ");
  }

  // Lessons sort by file name, so 02-scale comes before 10-minuet.
  const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  window.Piano = window.Piano || {};
  window.Piano.lesson = { frontMatter, options, fence, isPiece, kind, bookRef, resolve, title, byName };
})();
