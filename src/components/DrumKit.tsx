import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useMidi } from '../hooks/useMidi';
import { Sequencer } from './Sequencer';
import { SoundPicker } from './SoundPicker';
import { DjDecks } from './DjDecks';
import { triggerSound, initAudio, updateEffects, loadUserSample } from '../utils/audio';
import type { InstrumentType } from '../utils/audio';
import type { SampleFile } from '../data/sampleManifest';
import { Music, Volume2, Activity, Keyboard, Settings2, Save, Zap, Waves, Circle, Square as SquareIcon, History, Play, Trash2, Upload, Clock, ChevronDown, Plus, ListMusic, Layout } from 'lucide-react';

interface MidiEvent {
  id: string;
  note: number;
  velocity: number;
  timestamp: number;
}

interface Recording {
    id: number;
    name: string;
    events: MidiEvent[];
    duration: number; // Duration in ms
}

interface SoundMapping {
  instrument: InstrumentType;
  pitch: number; // Semitone offset
  volume?: number; // 0-1
  pan?: number; // -1 to 1
}

interface Preset {
    id: string;
    name: string;
    mappings: Record<number, SoundMapping>;
}

// Default mapping is now empty to force manual configuration
const DEFAULT_MAPPING: Record<number, SoundMapping> = {};

export const DrumKit: React.FC = () => {
  const { inputs, selectedInputId, setSelectedInputId, addListener } = useMidi();
  const [activeNote, setActiveNote] = useState<number | null>(null);
  
  // Effects State
  const [reverbAmt, setReverbAmt] = useState(0.2); // Default dry-ish
  const [distAmt, setDistAmt] = useState(0);       // Default clean
  const [masterVol, setMasterVol] = useState(0.8);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const currentRecordingRef = useRef<MidiEvent[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  // Mapping & Preset State
  const [mappings, setMappings] = useState<Record<number, SoundMapping>>(() => {
    const saved = localStorage.getItem('rixton_drum_map_v2');
    return saved ? JSON.parse(saved) : DEFAULT_MAPPING;
  });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  
  // Metronome State
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const metronomeLoopRef = useRef<Tone.Loop | null>(null);
  
  // Active Loops for Recordings
  const activeRecordingLoops = useRef<Map<number, Tone.Part>>(new Map());

  // Ref to hold latest mappings for event listener
  const mappingsRef = useRef(mappings);

  // UI State
  const [viewMode, setViewMode] = useState<'drums' | 'dj'>('drums');
  const [showDebug, setShowDebug] = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [selectedNoteForEdit, setSelectedNoteForEdit] = useState<number | null>(null);
  
  const [midiHistory, setMidiHistory] = useState<MidiEvent[]>([]);

  // Load presets from DB
  useEffect(() => {
      fetch('/api/presets')
          .then(res => res.json())
          .then(data => {
              // Map DB format to Preset format
              const loaded = data.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  mappings: p.data // Parsed JSON from server
              }));
              setPresets(loaded);
          })
          .catch(err => console.error("Failed to load presets:", err));
  }, []);

  // Auto-Init Audio on first interaction
  useEffect(() => {
      const startAudio = async () => {
          if (Tone.context.state !== 'running') {
              try {
                  await Tone.start();
              } catch (e) {
                  console.warn("Audio start failed:", e);
              }
          }
          await initAudio();
      };
      
      const handleInteraction = () => {
          startAudio();
          window.removeEventListener('click', handleInteraction);
          window.removeEventListener('keydown', handleInteraction);
      };

      window.addEventListener('click', handleInteraction);
      window.addEventListener('keydown', handleInteraction);
      
      return () => {
          window.removeEventListener('click', handleInteraction);
          window.removeEventListener('keydown', handleInteraction);
      };
  }, []);

  // Update effects when state changes
  useEffect(() => {
      updateEffects({ reverb: reverbAmt, distortion: distAmt, volume: masterVol });
  }, [reverbAmt, distAmt, masterVol]);

  // Sync ref and local storage
  useEffect(() => {
    mappingsRef.current = mappings;
    localStorage.setItem('rixton_drum_map_v2', JSON.stringify(mappings));
  }, [mappings]);

  useEffect(() => {
    const removeListener = addListener((note, velocity) => {
      setActiveNote(note);
      
      // Auto-select the note in the mapper if it's open
      if (showDebug) {
          setSelectedNoteForEdit(note);
      }
      
      // Ensure audio is initialized
      initAudio(); 

      const now = Date.now();
      // Generate a unique ID for React keys
      const newEvent: MidiEvent = { 
          id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
          note, 
          velocity, 
          timestamp: now 
      };
      
      // Update History - Strictly LIMIT TO 3 using functional update to prevent glitches
      setMidiHistory(prev => [newEvent, ...prev].slice(0, 3));

      // Handle Recording
      if (isRecordingRef.current) {
          const relativeEvent = { ...newEvent, timestamp: now - recordStartTimeRef.current };
          currentRecordingRef.current.push(relativeEvent);
      }

      // Read Directly from ref
      const mapping = mappingsRef.current[note];
      
      // Debug log to see what's happening
      // console.log(`MIDI Note: ${note}, Mapping:`, mapping);

      if (mapping) {
         triggerSound(mapping.instrument, velocity, { pitch: mapping.pitch, triggerNote: note, volume: mapping.volume, pan: mapping.pan });
      } else {
         // Fallback if no mapping exists at all
         triggerSound('cowbell', velocity, { pitch: 12 });
      }
    });

    return () => removeListener();
  }, [addListener, showDebug]); // Removed isRecording and mappings from dependency

  // Metronome Logic
  useEffect(() => {
      if (isMetronomeOn) {
          // Ensure audio is ready
          if (Tone.context.state !== 'running') Tone.start();
          initAudio().then(() => {
            const click = new Tone.MembraneSynth({
                pitchDecay: 0.01,
                octaves: 2,
                envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
            }).toDestination();
            
            const loop = new Tone.Loop((time) => {
                click.triggerAttackRelease("C5", "32n", time);
            }, "4n");
            
            if (Tone.Transport.state !== 'started') {
                Tone.Transport.start();
            }
            loop.start(0);
            metronomeLoopRef.current = loop;
          });
          
          return () => {
              if (metronomeLoopRef.current) {
                  metronomeLoopRef.current.dispose();
                  metronomeLoopRef.current = null;
              }
          };
      } else {
          if (metronomeLoopRef.current) {
              metronomeLoopRef.current.dispose();
              metronomeLoopRef.current = null;
          }
      }
  }, [isMetronomeOn]);

  const saveKit = async () => {
      const name = prompt("Enter a name for this drum kit:", "Custom Kit");
      if (name) {
          const newPreset: Preset = {
              id: Date.now().toString(),
              name,
              mappings: mappings
          };
          
          // Save to State (Optimistic)
          setPresets([newPreset, ...presets]);
          
          // Save to DB
          try {
              await fetch('/api/presets', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      id: newPreset.id,
                      name: newPreset.name,
                      data: newPreset.mappings
                  })
              });
          } catch (e) {
              console.error("Failed to save preset:", e);
              alert("Failed to save to database!");
          }
      }
  };

  const loadKit = (preset: Preset) => {
      if (window.confirm(`Load "${preset.name}"? This will overwrite unsaved changes.`)) {
          setMappings(preset.mappings);
          setShowPresetMenu(false);
      }
  };

  const deleteKit = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (window.confirm("Delete this kit?")) {
          setPresets(presets.filter(p => p.id !== id));
          try {
              await fetch(`/api/presets/${id}`, { method: 'DELETE' });
          } catch (e) {
              console.error("Failed to delete preset:", e);
          }
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedNoteForEdit === null || !e.target.files || e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      loadUserSample(selectedNoteForEdit, url);
  };

  const toggleRecording = () => {
      if (!isRecording) {
          currentRecordingRef.current = [];
          recordStartTimeRef.current = Date.now();
          setIsRecording(true);
          isRecordingRef.current = true;
      } else {
          setIsRecording(false);
          isRecordingRef.current = false;
          if (currentRecordingRef.current.length > 0) {
              const now = Date.now();
              const duration = now - recordStartTimeRef.current;
              
              const newRec: Recording = {
                  id: Date.now(),
                  name: `Take ${recordings.length + 1}`,
                  events: [...currentRecordingRef.current],
                  duration: duration
              };
              setRecordings([newRec, ...recordings]);
          }
      }
  };

  const stopAllRecordings = () => {
      activeRecordingLoops.current.forEach(part => part.dispose());
      activeRecordingLoops.current.clear();
      // Force update to UI if needed
      setRecordings(prev => [...prev]); 
  };

  const playBackRecording = async (rec: Recording) => {
      console.log(`Starting playback for: ${rec.name} (${rec.events.length} events, ${rec.duration}ms)`);
      
      // Ensure audio ready
      if (Tone.context.state !== 'running') await Tone.start();
      await initAudio();

      // If already playing, stop it (toggle behavior)
      if (activeRecordingLoops.current.has(rec.id)) {
          console.log("Stopping active part");
          activeRecordingLoops.current.get(rec.id)?.dispose();
          activeRecordingLoops.current.delete(rec.id);
          return; 
      }
      
      // Ensure Transport is running for scheduled events
      if (Tone.Transport.state !== 'started') {
          console.log("Starting Transport");
          Tone.Transport.start();
      }

      // Convert ms timestamps to seconds for Tone.js
      // We add a small buffer (0.1s) to ensure first notes aren't missed
      const startOffset = Tone.Transport.seconds + 0.1;

      const partEvents = rec.events.map(evt => ({
          time: evt.timestamp / 1000, 
          note: evt.note,
          velocity: evt.velocity
      }));

      // Use the recorded duration for the length
      const recordingDuration = rec.duration / 1000;

      const part = new Tone.Part((time, value) => {
          const mapping = mappingsRef.current[value.note];
          if (mapping) {
               // Schedule Audio
               triggerSound(mapping.instrument, value.velocity, { 
                   pitch: mapping.pitch, 
                   triggerNote: value.note, 
                   volume: mapping.volume, 
                   pan: mapping.pan,
                   time: time 
               });

               // Schedule Visuals
               Tone.Draw.schedule(() => {
                   setActiveNote(value.note);
                   setTimeout(() => setActiveNote(null), 100);
               }, time);
          }
      }, partEvents);

      part.start(startOffset);
      part.loop = false;
      
      activeRecordingLoops.current.set(rec.id, part);
      
      // Schedule a callback to clean up the part after it finishes
      Tone.Transport.scheduleOnce(() => {
           // Verify it's still the same part (user might have restarted it)
           if (activeRecordingLoops.current.get(rec.id) === part) {
               part.dispose();
               activeRecordingLoops.current.delete(rec.id);
           }
      }, startOffset + recordingDuration);
  };

  const deleteRecording = (id: number) => {
      if (activeRecordingLoops.current.has(id)) {
          activeRecordingLoops.current.get(id)?.dispose();
          activeRecordingLoops.current.delete(id);
      }
      setRecordings(recordings.filter(r => r.id !== id));
  };

  const updateMapping = (note: number, instrument: InstrumentType, pitch: number) => {
     setMappings(prev => ({
       ...prev,
       [note]: { 
           ...prev[note], // Preserve existing volume/pan
           instrument, 
           pitch 
       }
     }));
  };

  const handleLibraryLoad = (sample: SampleFile) => {
    if (selectedNoteForEdit === null) {
        alert("Please select a drum pad (Note) from the grid first (in 'Configure / Map Drums'), then select a sound.");
        setShowDebug(true);
        setShowSoundPicker(false);
        return;
    }
    
    if (sample.path.startsWith('std:')) {
        const type = sample.path.replace('std:', '') as InstrumentType;
        updateMapping(selectedNoteForEdit, type, 0);
    } else {
        // Handle absolute URLs (http/https) vs local relative paths
        const isAbsolute = sample.path.startsWith('http');
        const url = isAbsolute ? sample.path : `/${sample.path}`;
        
        // Load the sample
        loadUserSample(selectedNoteForEdit, url);
        // Update the mapping to use 'custom' instrument type
        updateMapping(selectedNoteForEdit, 'custom', 0);
    }
    
    setShowSoundPicker(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-100 p-8 pb-32 relative">
      {showSoundPicker && (
          <SoundPicker 
            onSelect={handleLibraryLoad}
            onClose={() => setShowSoundPicker(false)}
          />
      )}
      <div className="max-w-6xl w-full">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-center bg-slate-800 p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            {/* Logo and title removed */}
          </div>

          <div className="flex flex-col gap-3">
             <div className="flex flex-wrap gap-2 justify-end">
                {/* View Mode Toggle */}
                <button 
                    onClick={() => setViewMode(viewMode === 'drums' ? 'dj' : 'drums')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs transition-all ${viewMode === 'dj' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    <Layout size={16} />
                    {viewMode === 'drums' ? 'DJ Mode' : 'Drum Mode'}
                </button>

                {/* Metronome */}
                <button 
                    onClick={() => setIsMetronomeOn(!isMetronomeOn)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs transition-colors ${isMetronomeOn ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'}`}
                    title="Metronome"
                >
                    <Clock size={16} />
                    {isMetronomeOn ? 'ON' : 'OFF'}
                </button>

                {/* Preset Manager */}
                <div className="relative">
                    <button 
                         onClick={() => setShowPresetMenu(!showPresetMenu)}
                         className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold text-slate-200 transition-colors"
                    >
                        <Save size={16} /> Load / Save Kit <ChevronDown size={14} />
                    </button>
                    
                    {showPresetMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden">
                            <button onClick={saveKit} className="w-full text-left px-4 py-3 hover:bg-indigo-600 flex items-center gap-2 text-sm">
                                <Plus size={14} /> Save Current Kit
                            </button>
                            <div className="border-t border-slate-700 my-1"></div>
                            {presets.length === 0 && <div className="px-4 py-2 text-xs text-slate-500 italic">No saved kits</div>}
                            {presets.map(p => (
                                <div key={p.id} className="flex items-center justify-between px-4 py-2 hover:bg-slate-700 group">
                                    <button onClick={() => loadKit(p)} className="text-sm text-slate-200 text-left flex-1">{p.name}</button>
                                    <button onClick={(e) => deleteKit(e, p.id)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>

            <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-700">
              <select 
                className="bg-transparent border-none outline-none text-sm text-slate-200 w-64"
                value={selectedInputId}
                onChange={(e) => setSelectedInputId(e.target.value)}
              >
                {inputs.length === 0 && <option value="">No MIDI Devices Found</option>}
                {inputs.map(input => (
                  <option key={input.id} value={input.id}>{input.name}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {viewMode === 'drums' ? (
            <>
                <Sequencer />
                
                {/* Global Effects Panel */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 shadow-lg">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
                            <Volume2 size={18} className="text-blue-400" /> Master Volume
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={masterVol} onChange={e => setMasterVol(Number(e.target.value))} className="accent-blue-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 shadow-lg">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
                            <Waves size={18} className="text-purple-400" /> Reverb (Space)
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={reverbAmt} onChange={e => setReverbAmt(Number(e.target.value))} className="accent-purple-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 shadow-lg">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
                            <Zap size={18} className="text-orange-400" /> Distortion (Grit)
                        </div>
                        <input type="range" min="0" max="0.5" step="0.01" value={distAmt} onChange={e => setDistAmt(Number(e.target.value))} className="accent-orange-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                </div>

                {/* Recording & Session Manager */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="md:col-span-1 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col items-center justify-center gap-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Recorder</h3>
                        <button 
                            onClick={toggleRecording}
                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.5)]' : 'bg-slate-700 hover:bg-slate-600'}`}
                        >
                            {isRecording ? <SquareIcon fill="white" size={24} /> : <Circle fill="red" className="text-red-500" size={24} />}
                        </button>
                        <span className={`text-xs font-bold ${isRecording ? 'text-red-400' : 'text-slate-500'}`}>
                            {isRecording ? 'RECORDING LIVE' : 'READY TO RECORD'}
                        </span>
                    </div>

                    <div className="md:col-span-3 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <History size={18} className="text-indigo-400" />
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Recent Takes</h3>
                            </div>
                            <button 
                                onClick={stopAllRecordings}
                                className="text-[10px] font-bold bg-slate-700 hover:bg-red-900/30 text-slate-400 hover:text-red-400 px-3 py-1 rounded-full border border-slate-600 transition-colors"
                            >
                                STOP ALL
                            </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {recordings.length === 0 && <p className="text-slate-600 text-sm italic">No recordings yet. Hit the red button to start.</p>}
                            {recordings.map(rec => (
                                <div key={rec.id} className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700 group hover:border-indigo-500 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-200">{rec.name}</span>
                                        <span className="text-[10px] text-slate-500 uppercase">{rec.events.length} notes</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => playBackRecording(rec)}
                                            className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                            title="Play Back"
                                        >
                                            <Play fill="currentColor" size={16} />
                                        </button>
                                        <button 
                                            onClick={() => deleteRecording(rec.id)}
                                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </>
        ) : (
            <DjDecks activeNote={activeNote} />
        )}

        <main className="relative bg-slate-800 rounded-2xl p-8 shadow-2xl min-h-[100px] flex flex-col items-center border border-slate-700">
          
          <div className="w-full flex justify-end">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${showDebug ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              <Settings2 size={16} />
              {showDebug ? 'Hide Mapper' : 'Configure / Map Drums'}
            </button>
          </div>
          
          {/* MAPPING INTERFACE */}
          {showDebug && (
            <div className="w-full mt-6 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex flex-col md:flex-row">
              
              {/* LEFT: Live Log & Grid */}
              <div className="flex-1 p-4 border-r border-slate-700">
                  <div className="flex items-center gap-2 mb-4">
                     <Activity size={18} className="text-green-400" />
                     <h3 className="font-bold text-slate-200">History</h3>
                  </div>
                  
                  {/* Recent History */}
                   <div className="mb-4 bg-slate-800 rounded p-2">
                     {midiHistory.length === 0 && <p className="text-slate-600 text-sm italic p-2">Waiting for input...</p>}
                     {midiHistory.map((evt) => (
                       <div 
                         key={evt.id} 
                         onClick={() => setSelectedNoteForEdit(evt.note)}
                         className={`
                           flex justify-between items-center text-sm p-2 rounded mb-1 cursor-pointer transition-colors
                           ${selectedNoteForEdit === evt.note ? 'bg-indigo-600 text-white' : 'bg-slate-700/50 hover:bg-slate-700'}
                         `}
                       >
                          <span className="font-mono">Note: {evt.note}</span>
                          <span className="opacity-70">Vel: {evt.velocity}</span>
                          {mappings[evt.note] ? (
                              <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-indigo-300">{mappings[evt.note].instrument}</span>
                          ) : (
                              <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">Unmapped</span>
                          )}
                       </div>
                     ))}
                   </div>

                   {/* Grid */}
                   <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: 48 }, (_, i) => i + 32).map(noteNum => { // Showing range 32-80 approx
                        const isMapped = !!mappings[noteNum];
                        const isActive = activeNote === noteNum;
                        const isSelected = selectedNoteForEdit === noteNum;
                        
                        return (
                          <div 
                            key={noteNum} 
                            onClick={() => setSelectedNoteForEdit(noteNum)}
                            className={`
                              h-8 text-[10px] flex items-center justify-center rounded cursor-pointer transition-all border
                              ${isActive ? 'bg-green-500 text-white font-bold scale-110 z-10' : ''}
                              ${isSelected && !isActive ? 'bg-indigo-600 text-white border-indigo-400' : ''}
                              ${!isSelected && !isActive ? (isMapped ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-800 text-slate-600 border-slate-700') : ''}
                            `}
                          >
                            {noteNum}
                          </div>
                        );
                      })}
                   </div>
              </div>

              {/* RIGHT: Edit Panel */}
              <div className="w-full md:w-80 bg-slate-800 p-6 flex flex-col">
                 <div className="flex items-center gap-2 mb-6">
                     <Settings2 size={18} className="text-indigo-400" />
                     <h3 className="font-bold text-slate-200">Settings</h3>
                  </div>

                  {selectedNoteForEdit ? (
                      <div className="space-y-6">
                          <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700">
                              <span className="text-sm text-slate-400">Editing Note</span>
                              <span className="text-2xl font-bold text-white font-mono">{selectedNoteForEdit}</span>
                          </div>

                          {/* Unified Sound Selection */}
                          <div className="space-y-4">
                              <label className="block text-xs font-bold text-slate-500 uppercase">Selected Sound</label>
                              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex items-center justify-between group">
                                  <div className="flex items-center gap-3">
                                      <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                                          <Music size={20} />
                                      </div>
                                      <div>
                                          <p className="text-sm font-bold text-white uppercase tracking-wider">
                                              {mappings[selectedNoteForEdit]?.instrument === 'custom' ? 'Custom Sample' : mappings[selectedNoteForEdit]?.instrument || 'Unmapped'}
                                          </p>
                                          <p className="text-[10px] text-slate-500">Click library to change</p>
                                      </div>
                                  </div>
                              </div>

                              <button 
                                  onClick={() => setShowSoundPicker(true)}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-all shadow-lg shadow-indigo-900/20"
                              >
                                  <ListMusic size={20} /> Open Sound Library
                              </button>

                              <div className="relative py-2">
                                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
                                  <div className="relative flex justify-center text-[10px] uppercase font-bold"><span className="bg-slate-800 px-2 text-slate-500">OR UPLOAD</span></div>
                              </div>

                              <div className="bg-slate-700 p-3 rounded-lg border border-slate-600">
                                  <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-slate-500 border-dashed rounded-lg cursor-pointer hover:bg-slate-600 hover:border-indigo-400 transition-all">
                                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                          <Upload size={20} className="text-slate-400 mb-1" />
                                          <p className="text-xs text-slate-400 font-bold">Local File</p>
                                      </div>
                                      <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
                                  </label>
                              </div>
                          </div>

                          {/* Pitch Slider */}
                          <div>
                              <div className="flex justify-between mb-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Pitch / Tune</label>
                                <span className="text-xs text-indigo-400">{mappings[selectedNoteForEdit]?.pitch || 0}</span>
                              </div>
                              <input 
                                type="range" 
                                min="-24" 
                                max="24" 
                                step="1"
                                value={mappings[selectedNoteForEdit]?.pitch || 0}
                                onChange={(e) => updateMapping(selectedNoteForEdit, mappings[selectedNoteForEdit]?.instrument || 'tom', parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                  <span>Low</span>
                                  <span>High</span>
                              </div>
                          </div>

                          {/* Volume Slider (Per Pad) */}
                          <div>
                              <div className="flex justify-between mb-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Pad Volume</label>
                                <span className="text-xs text-green-400">{Math.round((mappings[selectedNoteForEdit]?.volume ?? 1) * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="5" 
                                step="0.1"
                                value={mappings[selectedNoteForEdit]?.volume ?? 1}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setMappings(prev => ({
                                        ...prev,
                                        [selectedNoteForEdit]: { ...prev[selectedNoteForEdit], volume: val }
                                    }));
                                }}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                              />
                          </div>
                          
                          <div className="pt-4 border-t border-slate-700">
                             <button 
                               onClick={() => triggerSound(
                                   mappings[selectedNoteForEdit]?.instrument || 'cowbell', 
                                   100, 
                                   { 
                                       pitch: mappings[selectedNoteForEdit]?.pitch || 0,
                                       volume: mappings[selectedNoteForEdit]?.volume ?? 1,
                                       triggerNote: selectedNoteForEdit
                                   }
                               )}
                               className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                             >
                                 <Volume2 size={16} /> Test Sound
                             </button>
                          </div>

                      </div>
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center opacity-60">
                          <Keyboard size={48} className="mb-4" />
                          <p>Select a note from the grid <br/>or hit a drum pad to edit.</p>
                      </div>
                  )}
              </div>
            </div>
          )}


          {!selectedInputId && inputs.length === 0 && (
             <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center rounded-2xl z-10 backdrop-blur-sm">
                <div className="text-center p-6 bg-slate-800 rounded-xl border border-slate-600 shadow-2xl">
                    <h2 className="text-xl font-bold mb-2">No MIDI Device Detected</h2>
                    <p className="text-slate-400 mb-4">Please connect your Rixton drums via USB and refresh the page or press a key.</p>
                </div>
             </div>
          )}

        </main>
        
        <footer className="mt-8 text-center text-slate-500 text-sm">
            {/* Save notice removed */}
        </footer>
      </div>
    </div>
  );
};