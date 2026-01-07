import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Square, Trash2, Wind, Plus, Settings, X } from 'lucide-react';
import { triggerSound, updatePan, updateEffects } from '../utils/audio';
import type { InstrumentType } from '../utils/audio';

const STEPS = 16;

interface SequenceRow {
  id: string;
  name: string;
  instrument: InstrumentType;
  key: string; // Used for panner mapping (usually same as instrument)
  pitch?: number;
}

const DEFAULT_ROWS: SequenceRow[] = [
  { id: 'kick', name: 'Kick', instrument: 'kick', key: 'kick' },
  { id: 'snare', name: 'Snare', instrument: 'snare', key: 'snare' },
  { id: 'hh_c', name: 'Hi-Hat', instrument: 'hihat_closed', key: 'hihat_closed' },
  { id: 'hh_o', name: 'Hi-Hat O', instrument: 'hihat_open', key: 'hihat_open' },
  { id: 'tom_h', name: 'Tom H', instrument: 'tom', pitch: 3, key: 'tom' },
  { id: 'tom_l', name: 'Tom L', instrument: 'tom', pitch: -1, key: 'tom' },
  { id: 'crash', name: 'Crash', instrument: 'crash', key: 'crash' },
  { id: 'shaker', name: 'Shaker', instrument: 'shaker', key: 'hihat_closed' },
  { id: 'clap', name: 'Clap', instrument: 'clap', key: 'snare' },
];

export const Sequencer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tempo, setTempo] = useState(120);
  const [swing, setSwing] = useState(0);
  const [pans, setPans] = useState<Record<string, number>>({});
  
  // Editing state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  // Combined State for Rows and Grid to ensure sync
  const [seqState, setSeqState] = useState<{ rows: SequenceRow[], grid: boolean[][] }>(() => {
    const saved = localStorage.getItem('sequencer_state_v3');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.rows && parsed.grid && parsed.rows.length === parsed.grid.length) {
                return parsed;
            }
        } catch(e) {}
    }
    // Fallback or migration
    return {
        rows: DEFAULT_ROWS,
        grid: DEFAULT_ROWS.map(() => Array(STEPS).fill(false))
    };
  });

  // Save automatically
  useEffect(() => {
    localStorage.setItem('sequencer_state_v3', JSON.stringify(seqState));
  }, [seqState]);

  useEffect(() => {
      updateEffects({ swing });
  }, [swing]);

  const handlePanChange = (key: string, value: number) => {
      setPans(prev => ({ ...prev, [key]: value }));
      updatePan(key, value);
  };

  // Tone.js Loop
  useEffect(() => {
    const loop = new Tone.Sequence(
      (_time, step) => {
        setCurrentStep(step);
        
        seqState.rows.forEach((row, rowIndex) => {
          if (seqState.grid[rowIndex][step]) {
             // @ts-ignore
             triggerSound(row.instrument, 0.8, { pitch: row.pitch });
          }
        });
      },
      Array.from({ length: STEPS }, (_, i) => i),
      "16n"
    );

    if (isPlaying) {
      Tone.Transport.start();
      loop.start(0);
    } else {
      Tone.Transport.stop();
      // Wrap stop in try/catch to handle potential Tone.js floating point scheduling errors
      try {
          loop.stop();
      } catch (e) {
          console.warn("Benign error stopping sequence:", e);
      }
      setCurrentStep(0);
    }

    return () => {
      loop.dispose();
    };
  }, [isPlaying, seqState]); 

  useEffect(() => {
    Tone.Transport.bpm.value = tempo;
  }, [tempo]);

  const toggleStep = (rowIndex: number, colIndex: number) => {
    const newGrid = seqState.grid.map(row => [...row]);
    newGrid[rowIndex][colIndex] = !newGrid[rowIndex][colIndex];
    setSeqState(prev => ({ ...prev, grid: newGrid }));
  };

  const clearGrid = () => {
      setSeqState(prev => ({
          ...prev,
          grid: prev.rows.map(() => Array(STEPS).fill(false))
      }));
  };

  const addTrack = () => {
      const newRow: SequenceRow = { 
          id: Date.now().toString(), 
          name: 'New Track', 
          instrument: 'kick', 
          key: 'kick' 
      };
      setSeqState(prev => ({
          rows: [...prev.rows, newRow],
          grid: [...prev.grid, Array(STEPS).fill(false)]
      }));
      setEditingRowId(newRow.id); // Auto open edit
  };

  const deleteTrack = (index: number) => {
      if (window.confirm("Remove this track?")) {
          setSeqState(prev => ({
              rows: prev.rows.filter((_, i) => i !== index),
              grid: prev.grid.filter((_, i) => i !== index)
          }));
      }
  };

  const updateRow = (index: number, updates: Partial<SequenceRow>) => {
      const newRows = [...seqState.rows];
      newRows[index] = { ...newRows[index], ...updates };
      // Update key if instrument changes to ensure panning works
      if (updates.instrument) {
          newRows[index].key = updates.instrument; 
      }
      setSeqState(prev => ({ ...prev, rows: newRows }));
  };

  return (
    <div className="w-full bg-slate-900 rounded-xl border border-slate-700 p-6 mb-8 shadow-xl">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded">FL</span>
            Step Sequencer
        </h3>
        
        <div className="flex items-center gap-4 bg-slate-800 p-2 rounded-lg border border-slate-700">
           <button 
             onClick={() => setIsPlaying(!isPlaying)}
             className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition-all ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
           >
             {isPlaying ? <Square fill="currentColor" size={16} /> : <Play fill="currentColor" size={16} />}
             {isPlaying ? 'STOP' : 'PLAY'}
           </button>
           
           <div className="flex items-center gap-2 px-4 border-l border-r border-slate-600">
              <span className="text-xs font-bold text-slate-400 uppercase">BPM</span>
              <input 
                type="number" 
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="w-16 bg-slate-700 border border-slate-600 rounded text-center text-white py-1 focus:outline-none focus:border-indigo-500"
              />
           </div>

           <div className="flex items-center gap-2 px-2 border-r border-slate-600">
              <Wind size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-400 uppercase">Swing</span>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={swing}
                onChange={(e) => setSwing(Number(e.target.value))}
                className="w-20 accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
           </div>

           <button onClick={clearGrid} className="text-slate-400 hover:text-red-400 px-2" title="Clear All">
              <Trash2 size={16} />
           </button>
        </div>
      </div>

      {/* Grid Header */}
      <div className="flex items-center gap-2 min-w-[700px] mb-2 px-2">
           <div className="w-24 text-right pr-2 text-[10px] font-bold text-slate-500 uppercase">Track Name</div>
           <div className="w-24 text-center text-[10px] font-bold text-slate-500 uppercase">Pan</div>
           <div className="flex-1 flex gap-1">
               {[1,2,3,4].map(i => (
                   <div key={i} className="flex-1 text-[10px] font-bold text-slate-600 uppercase text-center border-b border-slate-700">Bar {i}</div>
               ))}
           </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1 overflow-x-auto pb-4">
        {seqState.rows.map((row, rowIndex) => (
          <div key={row.id} className="flex items-center gap-2 min-w-[700px] group bg-slate-800/30 hover:bg-slate-800/80 p-1 rounded-lg transition-colors">
            
            {/* Track Name / Controls */}
            <div className="w-24 flex items-center justify-end gap-2 pr-2">
                <span className="text-xs font-bold text-slate-300 truncate">{row.name}</span>
                <button 
                    onClick={() => setEditingRowId(editingRowId === row.id ? null : row.id)}
                    className={`text-slate-500 hover:text-indigo-400 ${editingRowId === row.id ? 'text-indigo-400' : ''}`}
                >
                    {editingRowId === row.id ? <X size={14} /> : <Settings size={14} />}
                </button>
            </div>
            
            {/* Pan Knob (Wide Slider) */}
            <div className="flex items-center w-24">
                <input 
                    type="range" 
                    min="-1" 
                    max="1" 
                    step="0.1" 
                    value={pans[row.key] || 0}
                    onChange={(e) => handlePanChange(row.key, Number(e.target.value))}
                    className="w-full accent-slate-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer group-hover:accent-indigo-500"
                    title="Pan Left/Right"
                />
            </div>

            {/* Steps Grid */}
            <div className="flex-1 grid grid-cols-16 gap-1">
              {seqState.grid[rowIndex].map((active, stepIndex) => {
                 const isCurrent = isPlaying && currentStep === stepIndex;
                 const isBeat = stepIndex % 4 === 0; 
                 
                 return (
                   <div 
                     key={stepIndex}
                     onClick={() => toggleStep(rowIndex, stepIndex)}
                     className={`
                       h-8 rounded-sm cursor-pointer transition-colors border
                       ${active ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}
                       ${isCurrent ? 'brightness-150 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : ''}
                       ${!active && isBeat ? 'bg-slate-700/80' : ''}
                     `}
                   />
                 );
              })}
            </div>

            {/* Edit Panel (Inline) */}
            {editingRowId === row.id && (
                <div className="absolute left-0 right-0 z-10 mt-10 mx-6 bg-slate-800 border border-slate-600 p-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <span className="text-xs font-bold text-slate-400">EDIT TRACK:</span>
                    <input 
                        type="text" 
                        value={row.name} 
                        onChange={(e) => updateRow(rowIndex, { name: e.target.value })}
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                        placeholder="Track Name"
                    />
                    <select 
                        value={row.instrument}
                        onChange={(e) => updateRow(rowIndex, { instrument: e.target.value as InstrumentType })}
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                    >
                        <option value="kick">Kick</option>
                        <option value="kick_808">808 Kick</option>
                        <option value="snare">Snare</option>
                        <option value="snare_808">808 Snare</option>
                        <option value="clap">Clap</option>
                        <option value="hihat_closed">Hi-Hat Closed</option>
                        <option value="hihat_open">Hi-Hat Open</option>
                        <option value="tom">Tom</option>
                        <option value="crash">Crash</option>
                        <option value="ride">Ride</option>
                        <option value="china">China</option>
                        <option value="splash">Splash</option>
                        <option value="cowbell">Cowbell</option>
                        <option value="shaker">Shaker</option>
                        <option value="tambourine">Tambourine</option>
                        <option value="conga_high">Conga High</option>
                        <option value="conga_low">Conga Low</option>
                    </select>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Pitch</span>
                        <input 
                            type="number" 
                            value={row.pitch || 0} 
                            onChange={(e) => updateRow(rowIndex, { pitch: Number(e.target.value) })}
                            className="w-12 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                        />
                    </div>

                    <div className="flex-1"></div>
                    <button 
                        onClick={() => deleteTrack(rowIndex)}
                        className="flex items-center gap-1 text-red-400 hover:bg-red-900/20 px-3 py-1 rounded text-xs font-bold"
                    >
                        <Trash2 size={12} /> Remove
                    </button>
                    <button onClick={() => setEditingRowId(null)} className="text-slate-400 hover:text-white"><X size={16}/></button>
                </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Track Button */}
      <button 
        onClick={addTrack}
        className="w-full py-2 mt-2 border-2 border-dashed border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-all"
      >
          <Plus size={16} /> Add New Track
      </button>
    </div>
  );
};
