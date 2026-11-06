// =========================================================
//  NEON SURVIVOR: CORE BREACH — Main entry point
// =========================================================
import { Game } from './Game.js';

function boot() {
  try {
    const game = new Game();
    game.init();
    window.GAME = game; // debug handle

    const $ = (id) => document.getElementById(id);
    const show = (id) => { const e = $(id); if (e) e.classList.remove('hidden'); };
    const hide = (id) => { const e = $(id); if (e) e.classList.add('hidden'); };

    let returnToPause = false;
    const openSub = (id) => { if (game.state === 'paused') { hide('pause'); returnToPause = true; } else { hide('menu'); } show(id); };
    const backSub = (id) => { hide(id); if (returnToPause) { returnToPause = false; show('pause'); } else { show('menu'); } };

    // unlock Web Audio on first user gesture
    const unlockAudio = () => { game.audio.unlock(); };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    // ---- MAIN MENU ----
    $('btn-start').addEventListener('click', () => { game.audio.unlock(); hide('menu'); show('briefing'); });
    $('btn-how').addEventListener('click', () => { openSub('how'); });
    $('btn-how-back').addEventListener('click', () => { backSub('how'); });
    $('btn-settings').addEventListener('click', () => { openSub('settings'); });
    $('btn-settings-back').addEventListener('click', () => { backSub('settings'); });

    // ---- SETTINGS ----
    const audioToggle = $('btn-audio-toggle');
    if (audioToggle) {
      audioToggle.addEventListener('click', () => {
        const muted = game.audio.toggle();
        game.ui.setMuted(muted);
        audioToggle.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
      });
      audioToggle.textContent = game.audio.isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
    }
    const qualityBtn = $('btn-quality');
    if (qualityBtn) {
      let high = true;
      qualityBtn.addEventListener('click', () => {
        high = !high;
        game.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
        qualityBtn.textContent = high ? 'HIGH' : 'LOW';
      });
    }

    // ---- BRIEFING -> DEPLOY ----
    $('btn-deploy').addEventListener('click', () => { hide('briefing'); game.start(); });
    $('btn-brief-back').addEventListener('click', () => { hide('briefing'); show('menu'); });

    // ---- PAUSE ----
    $('btn-resume').addEventListener('click', () => game.resume());
    $('btn-restart').addEventListener('click', () => game.restart());
    $('btn-pause-how').addEventListener('click', () => openSub('how'));
    $('btn-pause-settings').addEventListener('click', () => openSub('settings'));
    $('btn-quit').addEventListener('click', () => { hide('pause'); game.toMenu(); });

    // ---- GAME OVER ----
    $('btn-retry').addEventListener('click', () => game.restart());
    $('btn-menu').addEventListener('click', () => { game.toMenu(); });

    // ---- MISSION COMPLETE ----
    $('btn-again').addEventListener('click', () => game.restart());
    $('btn-complete-menu').addEventListener('click', () => { game.toMenu(); });

    // ---- MUTE ----
    $('mute-btn').addEventListener('click', () => game.toggleMute());

    // PART 5: load saved data on game startup
    try {
      const loadNum = (k, d) => parseInt(localStorage.getItem(k) || '0', 10) || d;
      const loadStr = (k, d) => localStorage.getItem(k) || d;
      const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0');
      const bs = $('best-score'); if (bs) bs.textContent = loadNum('cb_best_score', 0);
      const bt = $('best-time'); if (bt) bt.textContent = fmtTime(loadNum('cb_best_time', 0));
      const br = $('best-rank'); if (br) br.textContent = loadStr('cb_best_rank', 'D');
    } catch (e) {}

    console.log('[NEON SURVIVOR] initialized successfully.');
  } catch (err) {
    console.error('[NEON SURVIVOR] initialization failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
