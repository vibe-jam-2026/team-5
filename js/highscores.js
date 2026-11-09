// Local high-score table stored in localStorage (per browser).
import { CONFIG } from './config.js';

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(CONFIG.highscoreKey) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(CONFIG.highscoreKey, JSON.stringify(list)); } catch { /* storage blocked */ }
}

export const highscores = {
  list: load(),
  best() { return this.list[0]?.score ?? 0; },
  qualifies(score) {
    return score > 0 && (this.list.length < CONFIG.highscoreCount || score > this.list[this.list.length - 1].score);
  },
  // Returns the 0-based rank of the inserted entry.
  add(name, score, level, time = 0, kills = 0) {
    const entry = { name: name || '???', score, level, time: Math.floor(time), kills, date: new Date().toISOString().slice(0, 10) };
    this.list.push(entry);
    this.list.sort((a, b) => b.score - a.score);
    this.list = this.list.slice(0, CONFIG.highscoreCount);
    save(this.list);
    return this.list.indexOf(entry);
  },
};
