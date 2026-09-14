const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "core-sfx");
const catalogFile = path.join(root, "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const groups = {
  Memes:["Dramatic Pause","Tiny Fail","Comic Reveal","Awkward Ping","Reaction Drop","Surprise Pop","Suspense Tap","Viral Blip"],
  Gaming:["Level Up","Power Orb","Checkpoint","Arcade Jump","Menu Confirm","Rare Pickup","Portal Open","Boss Alert"],
  Reactions:["Wow Pop","Question Ping","Shock Hit","Happy Spark","Sad Drop","Tension Tick","Approval Bell","Confused Blip"],
  Whoosh:["Air Swipe","Fast Pass","Soft Sweep","Heavy Flyby","Reverse Sweep","Short Swish","Wide Motion","Logo Whoosh"],
  Impact:["Deep Hit","Metal Knock","Trailer Slam","Soft Thud","Bass Punch","Wood Hit","Glass Tap","Stone Drop"],
  Transition:["Quick Shift","Clean Move","Digital Wipe","Page Turn","Motion Snap","Smooth Reveal","Spin Pass","Flash Change"],
  Cartoon:["Spring Boing","Bubble Pop","Tiny Bounce","Rubber Squeak","Comic Whistle","Toy Drop","Funny Zip","Wobble"],
  UI:["Button Tap","Toggle","Notify","Success","Warning","Hover Tick","Open Panel","Close Panel"],
  Horror:["Dark Pulse","Ghost Air","Creepy Tick","Low Drone","Door Sting","Night Hit","Tension Rise","Reverse Breath"],
  Comedy:["Bonk","Tiny Trombone","Oops","Slip","Comic Drum","Silly Ping","Punchline","Clown Pop"],
  Anime:["Energy Spark","Power Burst","Speed Line","Magic Ping","Charge Up","Sword Air","Aura Hit","Scene Flash"],
  Animals:["Bird Chirp","Mouse Squeak","Frog Blip","Cat Tick","Dog Alert","Insect Buzz","Owl Note","Creature Pop"],
  Ambience:["Room Tone","Soft Wind","Night Air","Tech Hum","Rain Texture","Forest Bed","City Bed","Space Bed"],
  "Music Stings":["Bright Logo","Dark Logo","Victory","Mystery","News Tick","Retro Intro","Soft Outro","Epic Mark"],
  "Viral Sounds":["Fast Reveal","Reaction Bass","Short Drama","Meme Alert","Clip Pop","Creator Tag","Trend Shift","Punch Zoom"],
};
const rate = 22050;
function seeded(seed) { let state=seed>>>0; return () => ((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296); }
function wav(samples) {
  const buffer=Buffer.alloc(44+samples.length*2); buffer.write("RIFF",0);buffer.writeUInt32LE(36+samples.length*2,4);buffer.write("WAVEfmt ",8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write("data",36);buffer.writeUInt32LE(samples.length*2,40);samples.forEach((sample,index)=>buffer.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(sample*32767))),44+index*2));return buffer;
}
function synth(category,index) {
  const seed=[...`${category}${index}`].reduce((sum,char)=>sum+char.charCodeAt(0)*17,0), random=seeded(seed);
  const long=/Ambience|Horror/.test(category), duration=long?2.2+index*.08:.28+(index%5)*.12, total=Math.floor(rate*duration), samples=[];
  const base=90+(seed%620), noisy=/Whoosh|Impact|Transition|Ambience/.test(category), melodic=/Gaming|Anime|Music|UI/.test(category);
  for(let i=0;i<total;i++){const t=i/rate,p=i/total,attack=Math.min(1,p*20),release=Math.pow(1-p,long?1.2:2.4),env=attack*release;let frequency=base*(1+(index%3)*.35);if(/Whoosh|Transition|Anime/.test(category))frequency*=.45+p*2.4;if(/Horror/.test(category))frequency*=1-p*.35;let value=Math.sin(2*Math.PI*frequency*t);if(melodic)value=.65*value+.35*Math.sin(2*Math.PI*frequency*1.5*t);if(noisy)value=.5*value+.5*(random()*2-1);if(/Impact|Comedy|Memes|Viral/.test(category))value+=(random()*2-1)*Math.exp(-p*22);samples.push(value*env*.45);}return {samples,duration};
}
const existing = catalog.sounds.filter(sound => !String(sound.id).startsWith("gecko-pack-"));
const generated=[]; let serial=0;
for(const [category,names] of Object.entries(groups)) for(let index=0;index<names.length;index++){
  const id=`gecko-pack-${String(serial+1).padStart(3,"0")}`, file=`${id}.wav`, audio=synth(category,index);
  fs.writeFileSync(path.join(root,file),wav(audio.samples));
  generated.push({id,name:names[index],category,tags:[category.toLowerCase(),...names[index].toLowerCase().split(/\s+/)],duration:Number(audio.duration.toFixed(2)),file,license:"Original Media Gecko sound",popularity:80-(index*3)+(serial%7),added:"2026-09-14"}); serial++;
}
fs.writeFileSync(catalogFile,JSON.stringify({version:2,provider:"Media Gecko Original Pack",sounds:[...existing,...generated]},null,2)+"\n");
console.log(`Generated ${generated.length} original sounds. Total ${existing.length+generated.length}.`);
