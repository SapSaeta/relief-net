// Title cards of the demo video, shared by record.mjs (shown in the browser) and edit.mjs (drawn again at full
// size: in headless Chrome the first page of the recording came out at half scale in the top-left corner).

export const CARDS = {
  intro: ['🛟 relief-net', 'From a phone video of a damaged home to a prioritized, evidence-backed help request, with a person approving every dispatch.', 'Muse Spark · SAM 3.1 · Muse Voice Transcribe · Muse Spark Open on Baseten'],
  outro: ['🛟 relief-net', 'The AI proposes. People decide.', 'All people, places and messages in this demo are synthetic · github.com/SapSaeta/relief-net'],
};

export const cardHtml = (title, subtitle, foot = '') => `<!doctype html><html style="background:#0a0a0a;color:#ededed;font-family:-apple-system,Helvetica,Arial,sans-serif">
    <body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 140px;box-sizing:border-box">
    <div style="font-size:84px;font-weight:600;letter-spacing:-2px">${title}</div>
    <div style="font-size:34px;color:#a1a1a1;margin-top:20px;max-width:1100px;line-height:1.35">${subtitle}</div>
    <div style="font-size:22px;color:#6b6b6b;margin-top:48px">${foot}</div></body></html>`;
