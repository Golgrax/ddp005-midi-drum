import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

const BASE_MIRALESTE = "/samples/miraleste/685floyd - Miraleste (Drum & Melody Kit)";

// Instrument Types
export type InstrumentType = 
  | 'kick' 
  | 'kick_808'
  | 'snare' 
  | 'snare_808'
  | 'rimshot'
  | 'hihat_closed' 
  | 'hihat_open' 
  | 'tom' 
  | 'crash' 
  | 'splash'
  | 'china'
  | 'ride' 
  | 'cowbell' 
  | 'clap'
  | 'shaker'
  | 'tambourine'
  | 'conga_high'
  | 'conga_low'
  | 'custom';

// Default Kit Players
let defaultKit: Tone.Players;

// Fallback Synths (for unmapped instruments)
let tomSynth: Tone.MembraneSynth;
let crashSynth: Tone.MetalSynth;
let rideSynth: Tone.MetalSynth; 
let chinaSynth: Tone.MetalSynth;
let splashSynth: Tone.MetalSynth;
let woodblockSynth: Tone.MembraneSynth; 
let shakerSynth: Tone.NoiseSynth;
let congaSynth: Tone.MembraneSynth;

// Custom Samples Registry
// Key = "note_id" (e.g. "38" for snare pad), Value = Tone.Player
const customPlayers: Map<string, Tone.Player> = new Map();
// Key = "note_id", Value = Midi object
const customMidi: Map<string, Midi> = new Map();

let panners: Record<string, Tone.Panner> = {};

// Global Effects
let reverb: Tone.Reverb;
let distortion: Tone.Distortion;
let mainGain: Tone.Gain;

let midiSynth: Tone.PolySynth;

let isInitialized = false;

export const initAudio = async () => {
  if (isInitialized) return;

  await Tone.start();

  // Create Effects Chain
  mainGain = new Tone.Gain(0.8).toDestination();
  distortion = new Tone.Distortion(0).connect(mainGain); // 0 = clean
  reverb = new Tone.Reverb(1.5).connect(distortion);
  await reverb.generate(); 
  
  midiSynth = new Tone.PolySynth(Tone.Synth).connect(reverb);
  midiSynth.maxPolyphony = 32;

  // Helper to route synth to effects via a Panner
  const toFX = (synth: any, name: string) => {
    const panner = new Tone.Panner(0).connect(reverb);
    panners[name] = panner;
    synth.connect(panner);
  };

  // LOAD DEFAULT KIT SAMPLES
  // We use Tone.Players for efficient one-shot playback of the kit
  // Note: Paths with spaces must be encoded for Tone.js/Fetch
  
  // Strategy 2: encodeURI leaves '&' alone, which seems to be what Vite prefers for static file serving of existing folders with '&'
  const encodePath = (path: string) => encodeURI(path).replace(/#/g, '%23');

  defaultKit = new Tone.Players({
      'kick': encodePath(`${BASE_MIRALESTE}/Kicks/Beefy Kick.wav`),
      'kick_808': encodePath(`${BASE_MIRALESTE}/808/C_clouds 808.wav`),
      'snare': encodePath(`${BASE_MIRALESTE}/Snares/Bagg Snare.wav`),
      'snare_808': encodePath(`${BASE_MIRALESTE}/Snares/Dilla Snare.wav`),
      'hihat_closed': encodePath(`${BASE_MIRALESTE}/Hi hats/Tight Hat.wav`),
      'hihat_open': encodePath(`${BASE_MIRALESTE}/Open Hats/Dark OH.wav`),
      'clap': encodePath(`${BASE_MIRALESTE}/Claps/Sharp Clap.wav`),
  }).connect(reverb);

  // Synths for things we didn't find specific samples for yet
  tomSynth = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 4,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }
  });
  toFX(tomSynth, 'tom');

  // CRASH
  crashSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.5, release: 3 },
    harmonicity: 5.1,
    modulationIndex: 64,
    resonance: 3000,
    octaves: 1.5
  });
  crashSynth.frequency.value = 300;
  crashSynth.volume.value = -4; 
  toFX(crashSynth, 'crash');

  // SPLASH (Short, high)
  splashSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.4, release: 0.5 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5000,
    octaves: 1.5
  });
  splashSynth.frequency.value = 500;
  splashSynth.volume.value = -4;
  toFX(splashSynth, 'splash');

  // CHINA (Trashy)
  chinaSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.2, release: 2 },
    harmonicity: 6.5, // Dissonant
    modulationIndex: 80, // Heavy modulation
    resonance: 2000,
    octaves: 1.5
  });
  chinaSynth.frequency.value = 250;
  chinaSynth.volume.value = -3;
  toFX(chinaSynth, 'china');

  // RIDE
  rideSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 2.0, release: 3 },
    harmonicity: 8.1, 
    modulationIndex: 40,
    resonance: 5000,
    octaves: 1.0
  });
  rideSynth.frequency.value = 400;
  rideSynth.volume.value = -4;
  toFX(rideSynth, 'ride');
  
  // PERCUSSION
  woodblockSynth = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 2,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
  });
  toFX(woodblockSynth, 'cowbell');

  shakerSynth = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0 }
  });
  shakerSynth.volume.value = -10;
  toFX(shakerSynth, 'shaker');

  congaSynth = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 2,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }
  });
  toFX(congaSynth, 'conga');

  isInitialized = true;
};

export const updatePan = (name: string, value: number) => {
    if (panners[name]) {
        panners[name].pan.value = value;
    }
};

export const updateEffects = (params: { reverb?: number; distortion?: number; volume?: number; swing?: number }) => {
  if (!isInitialized) return;
  
  if (params.reverb !== undefined) {
    reverb.wet.value = Math.min(Math.max(params.reverb, 0), 1);
  }
  
  if (params.distortion !== undefined) {
    distortion.distortion = Math.min(Math.max(params.distortion, 0), 1);
  }

  if (params.volume !== undefined) {
     mainGain.gain.rampTo(params.volume, 0.1);
  }

  if (params.swing !== undefined) {
      Tone.Transport.swing = params.swing;
  }
};

export const loadUserSample = async (noteId: number, fileUrl: string) => {
    // Ensure audio context is ready
    if (!isInitialized) {
        // Fire and forget init, we will try to load anyway
        initAudio();
    }
    
    const key = String(noteId);
    const extension = fileUrl.split('.').pop()?.toLowerCase();

    // Dispose old player/midi if exists
    if (customPlayers.has(key)) {
        customPlayers.get(key)?.dispose();
        customPlayers.delete(key);
    }
    if (customMidi.has(key)) {
        customMidi.delete(key);
    }

    // Handle Omnisphere (Metadata only)
    if (extension === 'prt_omn') {
        console.log(`Mapping Omnisphere patch to note ${noteId}: ${fileUrl} (No audio)`);
        return;
    }

    // Handle MIDI Files
    if (extension === 'mid') {
        try {
            // Encode only if it looks like a local relative path, otherwise use as is
            const isAbsolute = fileUrl.startsWith('http');
            const cleanUrl = isAbsolute ? fileUrl : encodeURI(fileUrl).replace(/#/g, '%23');
            
            const response = await fetch(cleanUrl);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const midi = new Midi(arrayBuffer);
            customMidi.set(key, midi);
            console.log(`Loaded MIDI for Note ${noteId}: ${fileUrl}`);
        } catch (e) {
            console.error(`Failed to load MIDI for Note ${noteId}:`, e);
        }
        return;
    }

    // Handle Audio Files (WAV, MP3, etc)
    try {
        // Encode only if local relative path
        const isAbsolute = fileUrl.startsWith('http');
        const cleanUrl = isAbsolute ? fileUrl : encodeURI(fileUrl).replace(/#/g, '%23');
        
        const player = new Tone.Player().toDestination();
        player.connect(reverb);
        
        // Load specifically this buffer
        await player.load(cleanUrl);
        
        customPlayers.set(key, player);
        console.log(`Loaded audio sample for Note ${noteId}: ${cleanUrl}`);
    } catch (e) {
        console.error(`Failed to load sample for Note ${noteId}: ${fileUrl}`, e);
    }
};

interface SoundParams {
  pitch?: number; 
  volume?: number; // 0 to 1? or Db? Let's assume linear 0-1 multiplier for simplicity in calling code
  pan?: number; // -1 to 1
  triggerNote?: number;
  time?: number; // Precise scheduling time
}

export const triggerSound = (type: InstrumentType, velocity: number = 1, params: SoundParams = {}) => {
  // Auto-init if needed (fire and forget)
  if (!isInitialized) {
      initAudio();
  }

  const vel = velocity > 1 ? Math.min(Math.max(velocity / 127, 0.1), 1) : velocity;
  const time = params.time; // undefined = now
  
  // Apply volume param scaling (default 1)
  const volMult = params.volume !== undefined ? params.volume : 1;
  // Ensure we don't hit -Infinity for volume
  const effectiveVel = Math.max(vel * volMult, 0.001);
  
  // Calculate playback rate for pitch shifting samples (0 semitones = 1.0 rate)
  const pbRate = params.pitch ? Tone.intervalToFrequencyRatio(params.pitch) : 1;

  switch (type) {
    case 'custom':
        if (params.triggerNote !== undefined) {
            const key = String(params.triggerNote);
            
            // Check for MIDI
            if (customMidi.has(key)) {
                const midi = customMidi.get(key);
                if (midi) {
                    const now = time ?? Tone.now();
                    midi.tracks.forEach(track => {
                        track.notes.forEach(note => {
                            // Apply pitch transpose to MIDI notes if desired? 
                            // Midi notes are absolute. We could shift them.
                            // But usually users want to pitch-shift Audio. 
                            // Let's shift MIDI notes too!
                            const transposedNote = params.pitch ? Tone.Frequency(note.name).transpose(params.pitch).toNote() : note.name;
                            
                            midiSynth.triggerAttackRelease(
                                transposedNote,
                                note.duration,
                                now + note.time,
                                note.velocity * vel
                            );
                        });
                    });
                }
                return;
            }

            // Check for Audio Player
            const player = customPlayers.get(key);
            if (player) {
                if (player.loaded) {
                    player.playbackRate = pbRate;
                    player.start(time, 0, undefined);
                    player.volume.value = Tone.gainToDb(effectiveVel);
                } else {
                    console.warn(`Custom sound for note ${key} exists but is not loaded.`);
                }
            }
        }
        break;

    case 'kick':
      if (defaultKit.has('kick')) {
          const p = defaultKit.player('kick');
          p.playbackRate = pbRate;
          try {
             if (p.state === 'started') p.stop(time);
             p.start(time, 0, undefined);
             p.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore safe restart error */ }
      }
      break;

    case 'kick_808':
      if (defaultKit.has('kick_808')) {
          const p = defaultKit.player('kick_808');
          p.playbackRate = pbRate;
          try {
             if (p.state === 'started') p.stop(time);
             p.start(time, 0, undefined);
             p.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
      }
      break;

    case 'snare':
      if (defaultKit.has('snare')) {
          const p = defaultKit.player('snare');
          p.playbackRate = pbRate;
          try {
             if (p.state === 'started') p.stop(time);
             p.start(time, 0, undefined);
             p.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
      }
      break;
    
    case 'snare_808':
      if (defaultKit.has('snare_808')) {
          const p = defaultKit.player('snare_808');
          p.playbackRate = pbRate;
          try {
             if (p.state === 'started') p.stop(time);
             p.start(time, 0, undefined);
             p.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
      }
      break;
    
    case 'rimshot':
      if (woodblockSynth) woodblockSynth.triggerAttackRelease("E5", "32n", time, effectiveVel);
      break;

    case 'clap':
        if (defaultKit.has('clap')) {
          const p = defaultKit.player('clap');
          p.playbackRate = pbRate;
          try {
             if (p.state === 'started') p.stop(time);
             p.start(time, 0, undefined);
             p.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
        }
        break;

    case 'hihat_closed':
      if (defaultKit.has('hihat_closed')) {
          const player = defaultKit.player('hihat_closed');
          player.playbackRate = pbRate;
          try {
             if (player.state === 'started') player.stop(time);
             player.fadeOut = 0.05;
             player.start(time, 0, 0.1); 
             player.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
      }
      break;

    case 'hihat_open':
      if (defaultKit.has('hihat_open')) {
          const player = defaultKit.player('hihat_open');
          player.playbackRate = pbRate;
          try {
             if (player.state === 'started') player.stop(time);
             player.fadeOut = 0; 
             player.start(time, 0, undefined);
             player.volume.value = Tone.gainToDb(effectiveVel);
          } catch(e) { /* ignore */ }
      }
      break;

    case 'tom':
      if (tomSynth) {
          const tomBase = "C2";
          const tomNote = params.pitch ? Tone.Frequency(tomBase).transpose(params.pitch).toNote() : tomBase;
          tomSynth.triggerAttackRelease(tomNote, "8n", time, effectiveVel);
      }
      break;

    case 'crash':
      if (crashSynth) {
          crashSynth.triggerAttackRelease("C4", "1n", time, effectiveVel);
      }
      break;
    
    case 'splash':
      if (splashSynth) {
          splashSynth.triggerAttackRelease("E4", "8n", time, effectiveVel);
      }
      break;

    case 'china':
      if (chinaSynth) {
          chinaSynth.triggerAttackRelease("G4", "2n", time, effectiveVel);
      }
      break;

    case 'ride':
      if (rideSynth) {
          rideSynth.triggerAttackRelease("G4", "4n", time, effectiveVel * 0.8);
      }
      break;
      
    case 'cowbell':
       if (woodblockSynth) {
           const cbNote = params.pitch ? Tone.Frequency("G4").transpose(params.pitch).toNote() : "G4";
           woodblockSynth.triggerAttackRelease(cbNote, "16n", time, effectiveVel);
       }
       break;

    case 'shaker':
       if (shakerSynth) {
           shakerSynth.triggerAttackRelease("16n", time, effectiveVel * 0.5);
       }
       break;
    
    case 'tambourine':
       if (shakerSynth) {
           shakerSynth.triggerAttackRelease("32n", time, effectiveVel * 0.7);
       }
       break;

    case 'conga_high':
       if (congaSynth) {
           congaSynth.triggerAttackRelease("E4", "8n", time, effectiveVel);
       }
       break;
    
    case 'conga_low':
       if (congaSynth) {
           congaSynth.triggerAttackRelease("C3", "8n", time, effectiveVel);
       }
       break;
  }
};
