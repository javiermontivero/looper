// smplr 1.1.0 catalogs. Only descriptors are built here; samples load on selection.
export const GM_NAMES=["accordion","acoustic_bass","acoustic_grand_piano","acoustic_guitar_nylon","acoustic_guitar_steel","agogo","alto_sax","applause","bagpipe","banjo","baritone_sax","bassoon","bird_tweet","blown_bottle","brass_section","breath_noise","bright_acoustic_piano","celesta","cello","choir_aahs","church_organ","clarinet","clavinet","contrabass","distortion_guitar","drawbar_organ","dulcimer","electric_bass_finger","electric_bass_pick","electric_grand_piano","electric_guitar_clean","electric_guitar_jazz","electric_guitar_muted","electric_piano_1","electric_piano_2","english_horn","fiddle","flute","french_horn","fretless_bass","fx_1_rain","fx_2_soundtrack","fx_3_crystal","fx_4_atmosphere","fx_5_brightness","fx_6_goblins","fx_7_echoes","fx_8_scifi","glockenspiel","guitar_fret_noise","guitar_harmonics","gunshot","harmonica","harpsichord","helicopter","honkytonk_piano","kalimba","koto","lead_1_square","lead_2_sawtooth","lead_3_calliope","lead_4_chiff","lead_5_charang","lead_6_voice","lead_7_fifths","lead_8_bass__lead","marimba","melodic_tom","music_box","muted_trumpet","oboe","ocarina","orchestra_hit","orchestral_harp","overdriven_guitar","pad_1_new_age","pad_2_warm","pad_3_polysynth","pad_4_choir","pad_5_bowed","pad_6_metallic","pad_7_halo","pad_8_sweep","pan_flute","percussive_organ","piccolo","pizzicato_strings","recorder","reed_organ","reverse_cymbal","rock_organ","seashore","shakuhachi","shamisen","shanai","sitar","slap_bass_1","slap_bass_2","soprano_sax","steel_drums","string_ensemble_1","string_ensemble_2","synth_bass_1","synth_bass_2","synth_brass_1","synth_brass_2","synth_choir","synth_drum","synth_strings_1","synth_strings_2","taiko_drum","tango_accordion","telephone_ring","tenor_sax","timpani","tinkle_bell","tremolo_strings","trombone","trumpet","tuba","tubular_bells","vibraphone","viola","violin","voice_oohs","whistle","woodblock","xylophone"];
export const GM_KITS=['FluidR3_GM','MusyngKite','FatBoy'];
export const FAMILIES=[
 {engine:'electric',factory:'ElectricPiano',helper:'getElectricPianoNames',label:'EP'},
 {engine:'machine',factory:'DrumMachine',helper:'getDrumMachineNames',label:'Drum Machine'},
 {engine:'abuse',factory:'DrumAbuse',helper:'getDrumAbuseMachineNames',label:'DrumAbuse'},
 {engine:'mallet',factory:'Mallet',helper:'getMalletNames',label:'VCSL'},
 {engine:'mellotron',factory:'Mellotron',helper:'getMellotronNames',label:'Mellotron'},
 {engine:'smolken',factory:'Smolken',helper:'getSmolkenNames',label:'Contrabajo'},
 {engine:'versilian',factory:'Versilian',helper:'getVersilianInstruments',label:'VCSL experimental'}
];
export function title(name){return name.split('/').at(-1).replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim().replace(/^./,c=>c.toUpperCase());}
export function musicalRoles(name,engine){
 const text=name.toLowerCase().replace(/[_-]+/g,' ');
 if(['machine','abuse','drums'].includes(engine))return ['rhythm'];
 if(engine==='smolken'||/\b(bass|contrabass|sub)\b/.test(text)&&!/bassoon|bass drum|lead/.test(text))return ['bass'];
 if(/\b(drum|kick|snare|hat|tom|cymbal|agogo|woodblock|timpani|tambourine|bongo|conga|shaker)\b/.test(text))return ['rhythm'];
 if(/\b(fx|noise|applause|bird|gunshot|helicopter|seashore|telephone|harmonics|orchestra hit)\b/.test(text))return ['texture'];
 if(engine==='mallet'||/marimba|vibraphone|xylophone|glockenspiel|celesta|bell|kalimba|music box|dulcimer/.test(text))return ['rhythm','texture'];
 if(/\b(pad|choir|strings|ensemble|aahs|oohs)\b/.test(text)||engine==='mellotron')return ['background'];
 if(engine==='electric'||/piano|pianet|wurlitzer|cp80|tx81z|organ|guitar|harp|clav|accordion|banjo|koto|sitar|shamisen/.test(text))return ['accompaniment'];
 return ['melody'];
}
export function soundfonts(base=[]){
 const existing=new Set(base.filter(p=>p.engine==='soundfont').map(p=>(p.kit||'FluidR3_GM')+':'+p.instrument));
 return GM_NAMES.flatMap(instrument=>GM_KITS.filter(kit=>!existing.has(kit+':'+instrument)).map(kit=>({
  id:'gm:'+kit+':'+instrument,name:title(instrument)+' · '+(kit==='FluidR3_GM'?'Fluid':kit==='MusyngKite'?'Musyng':kit),
  category:'Instrumentos',engine:'soundfont',instrument,kit,roles:musicalRoles(instrument,'soundfont')
 })));
}
export async function discoverCatalog(lib,base,{timeoutMs=15000}={}){
 const presets=[],issues=[];
 await Promise.all(FAMILIES.map(async family=>{
  if(typeof lib[family.factory]!=='function'||typeof lib[family.helper]!=='function'){issues.push(family.label+': no disponible en esta versión');return;}
  let timer;
  try{
   const names=await Promise.race([Promise.resolve().then(()=>lib[family.helper]()),new Promise((_,reject)=>{timer=globalThis.setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
   if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||!name))throw Error('catálogo inválido');
   for(const instrument of [...new Set(names)].sort()){
    if(base.some(p=>p.engine===family.engine&&p.instrument===instrument))continue;
    presets.push({id:family.engine+':'+instrument,name:title(instrument)+' · '+family.label,
     category:'Instrumentos',engine:family.engine,instrument,roles:musicalRoles(instrument,family.engine)});
   }
  }catch{issues.push(family.label+': no se pudo consultar el catálogo');}
  finally{globalThis.clearTimeout(timer);}
 }));
 presets.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {presets,issues};
}
// Named drum kits expose groups rather than MIDI notes. Keep GM anchors and
// mirror MIDI 36–59 at the keyboard's middle C (60–83), as with the acoustic kit.
export function mapDrumGroups(groups){
 const map={},used=new Set();
 const slots=[
  [36,/^(kick|bass.?drum|bd)(\b|[-_])/i],[38,/^(snare|sd)(\b|[-_])/i],
  [37,/stick|rim/i],[39,/clap/i],[42,/closed|chh|hh.?closed|^hi.?hat$/i],
  [46,/open|ohh/i],[44,/pedal/i],[41,/floor|low.?tom/i],
  [45,/mid.?tom|^tom$/i],[48,/high.?tom/i],[49,/crash/i],[51,/ride/i],
  [56,/cowbell/i],[54,/tambourine/i]
 ];
 for(const [note,re] of slots){const group=groups.find(g=>!used.has(g)&&re.test(g));if(group){map[note]=group;used.add(group);}}
 const free=[...Array.from({length:24},(_,i)=>36+i),...Array.from({length:44},(_,i)=>84+i)];
 for(const group of groups)if(!used.has(group)){const note=free.find(n=>!map[n]);if(note===undefined)break;map[note]=group;used.add(group);}
 for(let note=36;note<60;note++)if(map[note])map[note+24]=map[note];
 return map;
}
