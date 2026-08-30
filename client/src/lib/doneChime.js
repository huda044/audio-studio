// Notifikasi selesai untuk user yang sedang di tab lain: bunyi "ting" pendek
// dibuat langsung dengan WebAudio (tanpa file audio) + flash judul tab.

let audioCtx = null;

export function playDoneChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    // Autoplay policy: context boleh suspended sampai ada gesture — resume diam-diam.
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  } catch {
    // Audio tidak tersedia / diblokir — bukan hal fatal.
  }
}

const BASE_TITLE = 'LuciVoid Audio Studio — Konversi Audio ke Roblox';

export function flashTabTitle(message) {
  try {
    document.title = `${message} · LuciVoid`;
    setTimeout(() => { document.title = BASE_TITLE; }, 5000);
  } catch {
    // abaikan
  }
}
