// Standard MIDI files (.mid) in, a song out (music.js), and a recording
// out as a .mid. Pure: bytes in, bytes out.
//
// Hands: a track named left/bass/LH is the left hand, right/treble/RH the
// right. Otherwise, with two note tracks the first is the right hand and
// the second the left; with one, the hands are worked out (hands.js).
//
// Empty bars before the music starts are left out (opts.skipLead), so a
// file opens where the playing does. The file itself isn't changed.
(function () {
  function parse(bytes, title = "", choice = null, opts = {}) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let p = 0;
    const u32 = () => { const v = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0; p += 4; return v; };
    const u16 = () => { const v = b[p] << 8 | b[p + 1]; p += 2; return v; };
    const str = (n) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s; };
    if (b.length < 14 || str(4) !== "MThd") throw new Error("not a MIDI file");
    const hlen = u32(); const format = u16(); const ntracks = u16(); const division = u16(); p = 8 + hlen;
    if (division & 0x8000) throw new Error("SMPTE-timed MIDI files aren't supported");
    const tracks = [];
    for (let t = 0; t < ntracks && p + 8 <= b.length; t++) {
      const id = str(4); const len = u32(); const end = Math.min(b.length, p + len);
      if (id !== "MTrk") { p = end; continue; }
      const ev = []; let tick = 0, status = 0, name = "";
      const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p < end); return v; };
      while (p < end) {
        tick += vlq();
        let s = b[p];
        if (s & 0x80) { p++; status = s; } else s = status;
        if (s === 0xff) {
          const type = b[p++]; const l = vlq(); const data = b.subarray(p, p + l); p += l;
          if (type === 0x51 && l === 3) ev.push({ tick, tempo: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (type === 0x58 && l >= 2) ev.push({ tick, ts: [data[0], 1 << data[1]] });
          else if (type === 0x03) name = String.fromCharCode(...data);
          else if (type === 0x2f) break;
        } else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
        else {
          const hi = s & 0xf0, ch = s & 0x0f;
          const d1 = b[p++]; const d2 = hi === 0xc0 || hi === 0xd0 ? 0 : b[p++];
          if (hi === 0x90 && d2 > 0) ev.push({ tick, on: d1, vel: d2, ch });
          else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) ev.push({ tick, off: d1, ch });
        }
      }
      p = end;
      tracks.push({ name, ev });
    }
    // Tempo and time signature can sit in any track (format 1: the first).
    const tempos = [], sigs = [];
    for (const tr of tracks) for (const e of tr.ev) { if (e.tempo) tempos.push(e); if (e.ts) sigs.push(e); }
    tempos.sort((a, c) => a.tick - c.tick);
    const toMs = msMapper(tempos, division);
    const noteTracks = [];
    for (const tr of tracks) {
      const open = new Map(), notes = [];
      for (const e of tr.ev) {
        if (e.on != null) { const k = e.ch * 128 + e.on; if (!open.has(k)) open.set(k, []); open.get(k).push(e); }
        else if (e.off != null) {
          const k = e.ch * 128 + e.off; const q = open.get(k);
          if (q && q.length) { const s = q.shift(); notes.push({ midi: s.on, tick: s.tick, endTick: e.tick, vel: s.vel, ch: s.ch }); }
        }
      }
      for (const q of open.values()) for (const s of q) notes.push({ midi: s.on, tick: s.tick, endTick: s.tick + division, vel: s.vel, ch: s.ch });
      // Drums (channel 10) aren't piano.
      const kept = notes.filter((n) => n.ch !== 9);
      if (kept.length) noteTracks.push({ name: tr.name, notes: kept });
    }
    // Each track's hand: the one you chose (right, left, split by pitch,
    // or off), else the guess.
    const guess = assignHands(noteTracks);
    const hands = noteTracks.map((_, i) => (choice && choice[i]) || guess[i] || "split");
    const ts = sigs.length ? sigs.sort((a, c) => a.tick - c.tick)[0].ts : [4, 4];
    // Whole bars only, counted on the first time signature.
    let cut = 0;
    const played = noteTracks.filter((_, i) => hands[i] !== "off");
    if (opts.skipLead !== false && played.length) {
      const first = Math.min(...played.map((tr) => Math.min(...tr.notes.map((n) => n.tick))));
      const bar = division * 4 * ts[0] / ts[1];
      // A note a hair early for the downbeat still counts as on it.
      cut = Math.floor((first + division / 32) / bar) * bar;
    }
    const cutMs = toMs(cut);
    const notes = [];
    noteTracks.forEach((tr, i) => {
      if (hands[i] === "off") return;
      const split = hands[i] === "split" ? window.Psanter.hands.assign(tr.notes.map((n) => ({ midi: n.midi, ms: toMs(n.tick) }))) : null;
      tr.notes.forEach((n, j) => {
        const ms = toMs(n.tick);
        notes.push({ midi: n.midi, ms: Math.max(0, ms - cutMs), dur: Math.max(20, toMs(n.endTick) - ms), vel: n.vel, hand: split ? split[j] : hands[i] });
      });
    });
    if (!notes.length) throw new Error("every track is off");
    // The tempo in force at the cut starts the song; later ones move back.
    let tempo = tempos.length ? tempos.map((e) => ({ ms: toMs(e.tick) - cutMs, bpm: 60000000 / e.tempo })) : [{ ms: 0, bpm: 120 }];
    const before = tempo.filter((x) => x.ms <= 0.5);
    tempo = [{ ms: 0, bpm: before.length ? before[before.length - 1].bpm : 120 }, ...tempo.filter((x) => x.ms > 0.5)];
    const song = window.Psanter.music.song({ notes, title, tempo, beatsPerBar: ts[0], beatUnit: ts[1] });
    song.skippedBars = cut ? Math.round(cut / (division * 4 * ts[0] / ts[1])) : 0;
    song.tracks = noteTracks.map((tr, i) => ({ name: tr.name || "", notes: tr.notes.length, hand: hands[i], guessed: !(choice && choice[i]) }));
    return song;
  }

  function msMapper(tempos, division) {
    const pts = [{ tick: 0, ms: 0, us: 500000 }];
    for (const t of tempos) {
      const last = pts[pts.length - 1];
      const ms = last.ms + (t.tick - last.tick) * last.us / division / 1000;
      if (t.tick === last.tick) last.us = t.tempo; else pts.push({ tick: t.tick, ms, us: t.tempo });
    }
    return (tick) => {
      let i = pts.length - 1; while (i > 0 && pts[i].tick > tick) i--;
      return pts[i].ms + (tick - pts[i].tick) * pts[i].us / division / 1000;
    };
  }

  // A hand per note track, or null where the pitch decides.
  function assignHands(tracks) {
    const named = tracks.map((t) => {
      const n = (t.name || "").toLowerCase();
      if (/\b(left|lh|bass|l\.?\s*h\.?)\b|links|izq/.test(n)) return "left";
      if (/\b(right|rh|treble|melody|r\.?\s*h\.?)\b|rechts|der/.test(n)) return "right";
      return null;
    });
    if (named.some(Boolean)) return named.map((h, i) => h || (named.includes("right") ? "left" : "right"));
    if (tracks.length === 2) return ["right", "left"];
    if (tracks.length > 2) {
      // The lowest-sounding track is the left hand, the rest the right.
      const avg = tracks.map((t) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length);
      const low = avg.indexOf(Math.min(...avg));
      return tracks.map((_, i) => (i === low ? "left" : "right"));
    }
    return [null];
  }

  // A recording ([{midi, ms, dur, vel}]) as a format-0 file at 120 bpm.
  // notes, or a list of layers (each a list of notes) for one track each.
  function write(notes) {
    const division = 480, msPerTick = 500 / division;
    const layers = Array.isArray(notes[0]) ? notes : [notes];
    const vlq = (v) => { const out = [v & 0x7f]; while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80); return out; };
    const track = (list, tempo) => {
      const ev = [];
      for (const n of list) {
        ev.push({ t: Math.round(n.ms / msPerTick), d: [0x90, n.midi, Math.max(1, Math.min(127, n.vel || 80))] });
        ev.push({ t: Math.round((n.ms + Math.max(10, n.dur)) / msPerTick), d: [0x80, n.midi, 0] });
      }
      ev.sort((a, c) => a.t - c.t || a.d[0] - c.d[0]);
      const body = tempo ? [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] : [];
      let last = 0;
      for (const e of ev) { body.push(...vlq(e.t - last), ...e.d); last = e.t; }
      body.push(0x00, 0xff, 0x2f, 0x00);
      const len = body.length;
      return [0x4d, 0x54, 0x72, 0x6b, len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...body];
    };
    const n = layers.length;
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, n > 1 ? 1 : 0, 0, n, division >> 8, division & 0xff];
    return new Uint8Array([...head, ...layers.flatMap((l, i) => track(l, i === 0))]);
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.midifile = { parse, write, assignHands };
})();
