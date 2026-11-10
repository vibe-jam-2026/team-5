// Voice commands: press V to turn the microphone on, then say "flares" to fire flares.
// On claude.ai test pages the page's dictation capability holds the mic; on the
// live site the browser's own speech recognition does (Chrome and Edge).
import { input } from './input.js';

// Words that fire flares (speech-to-text often hears "flair").
const FLARE_WORD = /\bfl(?:a|ai)res?\b|\bflairs?\b/gi;
const hits = (text) => (text.match(FLARE_WORD) || []).length;

let dict = null;              // claude.ai dictation namespace, once resolved
let dictPending = !!window.claude?.use;
if (dictPending) {
  window.claude.use('dictation').then((d) => { dict = d; }).catch(() => {}).finally(() => { dictPending = false; });
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let rec = null;               // browser SpeechRecognition while listening
let wanted = false;           // the player turned the mic on
let fired = 0;                // flare words already acted on in the phrase being spoken
const firedByResult = new Map();

function fire() {
  input.trigger('KeyF');
  voice.heard = { text: 'FLARES!', t: performance.now() };
}

// A phrase in progress: fire as soon as a new flare word shows up in it.
function partial(text) {
  const n = hits(text);
  if (n > fired) { fire(); fired = n; }
}
function final(text) {
  if (hits(text) > fired) fire();
  fired = 0;
}

function startDictation() {
  voice.state = 'starting';
  dict.onPartial(({ text }) => { if (text) partial(text); });
  dict.onFinal(({ text }) => final(text));
  dict.onState(({ state, reason }) => {
    if (state === 'listening') voice.state = 'on';
    else if (state === 'idle') {
      voice.state = reason === 'not_granted' ? 'denied' : reason === 'unavailable' ? 'unsupported' : 'off';
      wanted = false;
    }
  });
  dict.start().catch((e) => {
    wanted = false;
    voice.state = e?.code === 'not_granted' ? 'denied' : e?.code === 'unavailable' ? 'unsupported' : 'off';
  });
}

function startBrowser() {
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  firedByResult.clear();
  rec.onstart = () => { voice.state = 'on'; };
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const n = hits(ev.results[i][0].transcript), done = firedByResult.get(i) || 0;
      if (n > done) { fire(); firedByResult.set(i, n); }
    }
  };
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { wanted = false; voice.state = 'denied'; }
  };
  rec.onend = () => {   // recognition stops by itself now and then: keep it going while wanted
    if (wanted) { firedByResult.clear(); try { rec.start(); } catch { wanted = false; voice.state = 'off'; } }
    else voice.state = voice.state === 'denied' ? 'denied' : 'off';
  };
  voice.state = 'starting';
  try { rec.start(); } catch { wanted = false; voice.state = 'off'; }
}

function toggle() {
  if (wanted) {
    wanted = false;
    if (dict) dict.stop().catch(() => {});
    if (rec) rec.stop();
    voice.state = 'off';
    return;
  }
  if (dict) { wanted = true; startDictation(); }
  else if (dictPending) voice.state = 'loading';
  else if (SR) { wanted = true; startBrowser(); }
  else voice.state = 'unsupported';
}

export const voice = {
  state: 'off',               // 'off' | 'loading' | 'starting' | 'on' | 'denied' | 'unsupported'
  heard: null,                // { text, t } flash after a voice command
  allowToggle: true,          // main.js turns this off while typing initials
};

// Starting the mic must happen inside the key press itself, so V is handled here.
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && voice.allowToggle) toggle();
});
