const fs = require("node:fs");
const path = require("node:path");

const rate = 44100;
let randomState = 0x6d2b79f5;
function random() {
  randomState = Math.imul(randomState ^ randomState >>> 15, randomState | 1);
  randomState ^= randomState + Math.imul(randomState ^ randomState >>> 7, randomState | 61);
  return ((randomState ^ randomState >>> 14) >>> 0) / 4294967296;
}
function wave(type, phase) {
  if (type === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (type === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (type === "noise") return random() * 2 - 1;
  return Math.sin(phase);
}
function render(spec) {
  const count = Math.floor(spec.duration * rate);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / (spec.attack || .008));
    const decay = Math.pow(Math.max(0, 1 - t / spec.duration), spec.decay || 2);
    let value = 0;
    for (const layer of spec.layers) {
      const progress = t / spec.duration;
      const frequency = layer.from + (layer.to - layer.from) * progress;
      value += wave(layer.type || "sine", Math.PI * 2 * frequency * t + (layer.phase || 0)) * (layer.gain || 1);
    }
    samples[i] = Math.max(-32767, Math.min(32767, value * attack * decay * 12000));
  }
  const dataSize = samples.byteLength;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0); output.writeUInt32LE(36 + dataSize, 4); output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write("data", 36); output.writeUInt32LE(dataSize, 40);
  Buffer.from(samples.buffer).copy(output, 44);
  return output;
}

const sounds = [
  ["pixel-coin","Pixel Coin","Gaming",["coin","arcade","success"],.34,[["square",880,1320,.55],["sine",1760,2200,.25]]],
  ["retro-laser","Retro Laser","Retro",["laser","8-bit","game"],.46,[["square",1300,120,.55],["triangle",650,90,.3]]],
  ["ui-click","UI Click","UI",["click","interface","button"],.12,[["square",520,260,.4],["noise",1,1,.18]]],
  ["success-chime","Success Chime","Success",["success","complete","notification"],.72,[["sine",660,990,.45],["triangle",990,1480,.25]]],
  ["error-buzz","Error Buzz","Error",["error","fail","warning"],.48,[["square",155,130,.42],["square",164,138,.3]]],
  ["cinematic-impact","Cinematic Impact","Impact",["impact","boom","cinematic"],1.2,[["sine",92,38,.75],["noise",1,1,.35]]],
  ["fast-whoosh","Fast Whoosh","Whoosh",["whoosh","transition","sweep"],.68,[["noise",1,1,.58],["sine",180,860,.22]]],
  ["cartoon-boing","Cartoon Boing","Cartoon",["boing","spring","funny"],.82,[["sine",190,520,.62],["triangle",95,260,.28]]],
  ["comedy-bonk","Comedy Bonk","Comedy",["bonk","meme","hit"],.42,[["triangle",210,72,.7],["noise",1,1,.28]]],
  ["reaction-pop","Reaction Pop","Reactions",["reaction","pop","reveal"],.26,[["sine",320,940,.55],["noise",1,1,.16]]],
  ["anime-sparkle","Anime Sparkle","Anime",["sparkle","anime","magic"],.95,[["sine",1200,2100,.34],["triangle",1800,3000,.19]]],
  ["animal-chirp","Animal Chirp","Animals",["bird","chirp","animal"],.54,[["sine",1450,2300,.46],["sine",2100,1300,.25]]],
  ["music-sting","Music Sting","Music Stings",["sting","logo","music"],1.05,[["sine",440,660,.36],["triangle",660,990,.25],["sine",880,1320,.18]]],
  ["internet-blip","Internet Classic Blip","Internet Classics",["internet","notification","classic"],.38,[["square",740,520,.42],["sine",1480,1040,.22]]],
  ["robot-voice","Robot Voice Blip","Voice",["robot","voice","vocal"],.63,[["square",125,210,.35],["sine",250,420,.32]]],
  ["meme-drop","Meme Drop","Memes",["meme","drop","reaction"],.9,[["sine",380,52,.63],["noise",1,1,.2]]],
];

const output = path.join(__dirname, "..", "core-sfx");
fs.mkdirSync(output, { recursive: true });
const catalog = sounds.map(([id, name, category, tags, duration, layers], index) => {
  const normalized = layers.map(([type, from, to, gain]) => ({ type, from, to, gain }));
  fs.writeFileSync(path.join(output, `${id}.wav`), render({ duration, layers: normalized, decay: category === "Whoosh" ? .7 : 2 }));
  return { id, name, category, tags, duration, file: `${id}.wav`, license: "Original Media Gecko core sound", popularity: 100 - index * 3, added: "2026-09-13" };
});
fs.writeFileSync(path.join(output, "catalog.json"), JSON.stringify({ version: 1, provider: "Media Gecko Core", sounds: catalog }, null, 2));
console.log(`Generated ${catalog.length} core SFX.`);
