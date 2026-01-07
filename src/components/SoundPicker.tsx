import React, { useState, useMemo } from 'react';
import { Search, X, Music, Play, Plus, FileAudio, FileJson, Music2, Zap, Pause } from 'lucide-react';
import { SAMPLE_MANIFEST, type SampleFile } from '../data/sampleManifest';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

interface SoundPickerProps {
    onSelect: (sample: SampleFile) => void;
    onClose: () => void;
}

export const SoundPicker: React.FC<SoundPickerProps> = ({ onSelect, onClose }) => {
    const [activeTab, setActiveTab] = useState<'local' | 'online'>('local');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [playingPath, setPlayingPath] = useState<string | null>(null);
    const [onlineUrl, setOnlineUrl] = useState('');

    const categories = useMemo(() => {
        const cats = new Set(SAMPLE_MANIFEST.map(s => s.category));
        return Array.from(cats);
    }, []);

    const filteredSamples = useMemo(() => {
        return SAMPLE_MANIFEST.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 s.category.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory ? s.category === selectedCategory : true;
            return matchesSearch && matchesCategory;
        });
    }, [searchTerm, selectedCategory]);

    // Use refs to track current player instance to allow stopping it
    const activePlayer = React.useRef<Tone.Player | Tone.PolySynth | null>(null);
    const activeMidiSynth = React.useRef<Tone.PolySynth | null>(null);

    const stopPreview = () => {
        if (activePlayer.current) {
            activePlayer.current.dispose();
            activePlayer.current = null;
        }
        if (activeMidiSynth.current) {
            activeMidiSynth.current.dispose();
            activeMidiSynth.current = null;
        }
        setPlayingPath(null);
    };

    const playPreview = async (sample: SampleFile) => {
        // Toggle off if already playing this sample
        if (playingPath === sample.path) {
            stopPreview();
            return;
        }

        // Stop any existing playback
        stopPreview();

        if (sample.ext === 'prt_omn') {
            alert(`File: ${sample.name}\nType: Omnisphere Patch (.prt_omn)\n\nThese are data files for the Omnisphere VST plugin, not audio files. They cannot be previewed or played in the browser. You can still map them to a pad to trigger external MIDI events if you have a custom MIDI setup, but they will not produce sound here.`);
            return;
        }

        if (sample.ext === 'mid') {
            try {
                console.log("Attempting to preview MIDI:", sample.path);
                setPlayingPath(sample.path);
                await Tone.start();
                
                // Fetch the MIDI file
                const url = `/${encodeURI(sample.path).replace(/#/g, '%23')}`;
                console.log("Fetching MIDI from:", url);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch MIDI: ${response.statusText}`);
                
                const arrayBuffer = await response.arrayBuffer();
                const midi = new Midi(arrayBuffer);
                
                console.log("MIDI Parsed:", midi.name, "Tracks:", midi.tracks.length);

                // Play using a simple synth
                const synth = new Tone.PolySynth(Tone.Synth).toDestination();
                activeMidiSynth.current = synth; // Track it

                const now = Tone.now() + 0.1;
                
                let noteCount = 0;
                let maxDuration = 0;

                midi.tracks.forEach(track => {
                    track.notes.forEach(note => {
                        noteCount++;
                        synth.triggerAttackRelease(
                            note.name,
                            note.duration,
                            now + note.time,
                            note.velocity
                        );
                        if (note.time + note.duration > maxDuration) {
                            maxDuration = note.time + note.duration;
                        }
                    });
                });
                console.log(`Scheduled ${noteCount} notes.`);

                // Cleanup after duration
                const durationMs = (maxDuration * 1000) + 1000;
                setTimeout(() => {
                    if (playingPath === sample.path) {
                        setPlayingPath(null);
                        if (activeMidiSynth.current === synth) {
                            stopPreview();
                        }
                    }
                }, durationMs);

            } catch (e) {
                console.error("Error playing MIDI:", e);
                stopPreview();
            }
            return;
        }

        if (sample.path.startsWith('std:')) {
            const type = sample.path.replace('std:', '') as any;
            try {
                setPlayingPath(sample.path);
                await Tone.start();
                const { triggerSound, initAudio } = await import('../utils/audio');
                await initAudio();
                
                triggerSound(type, 1, { pitch: 0 });
                
                setTimeout(() => {
                     if (playingPath === sample.path) setPlayingPath(null); 
                }, 500);
            } catch (e) {
                console.error(e);
                setPlayingPath(null);
            }
            return;
        }

        try {
            setPlayingPath(sample.path);
            await Tone.start();

            // Alternative encoding strategy
            const url = `/${encodeURI(sample.path).replace(/#/g, '%23')}`;
            
            console.log(`Loading preview: ${url}`);

            const player = new Tone.Player().toDestination();
            activePlayer.current = player; // Track it

            // Explicit load to catch errors better
            await player.load(url);
            
            if (!player.loaded) {
                throw new Error("Buffer not loaded");
            }

            player.start();
            player.onstop = () => {
                if (activePlayer.current === player) {
                    setPlayingPath(null);
                    player.dispose();
                    activePlayer.current = null;
                }
            };
        } catch (error) {
            console.error("Error playing preview for:", sample.name, error);
            stopPreview();
        }
    };

    const getIcon = (ext: string) => {
        switch (ext) {
            case 'mid': return <Music2 size={20} className="text-yellow-400" />;
            case 'prt_omn': return <FileJson size={20} className="text-purple-400" />;
            case 'synth': return <Zap size={20} className="text-green-400" />;
            default: return <FileAudio size={20} className="text-blue-400" />;
        }
    };

    const handleOnlineLoad = () => {
        if (!onlineUrl) return;
        try {
            new URL(onlineUrl);
        } catch {
            alert("Please enter a valid URL (e.g. https://example.com/sound.mp3)");
            return;
        }

        const tempSample: SampleFile = {
            path: onlineUrl,
            name: 'Online Sample', 
            ext: onlineUrl.split('.').pop()?.slice(0, 3) || 'wav',
            category: 'Online'
        };
        
        onSelect(tempSample);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Sound Library</h2>
                        <p className="text-slate-400 text-sm">Select a sound to map to your drum pad</p>
                    </div>
                    <div className="flex gap-2 bg-slate-800 p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveTab('local')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'local' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Local
                        </button>
                        <button 
                            onClick={() => setActiveTab('online')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'online' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Online URL
                        </button>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'local' ? (
                    <>
                        <div className="p-4 bg-slate-800/50 flex flex-col gap-4">
                            {/* Search & Filters */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                <input 
                                    type="text"
                                    placeholder="Search samples, categories, extensions..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                <button 
                                    onClick={() => setSelectedCategory(null)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${selectedCategory === null ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                >
                                    ALL
                                </button>
                                {categories.map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${selectedCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                    >
                                        {cat.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 custom-scrollbar">
                            {filteredSamples.length === 0 && (
                                <div className="col-span-full py-20 text-center text-slate-500">
                                    <Music size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>No sounds found matching your search.</p>
                                </div>
                            )}
                            {filteredSamples.map((sample) => (
                                <div 
                                    key={sample.path}
                                    className="group bg-slate-800 border border-slate-700 rounded-xl p-4 hover:bg-slate-750 hover:border-indigo-500/50 transition-all cursor-pointer relative"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="bg-slate-900 p-2 rounded-lg">
                                            {getIcon(sample.ext)}
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); playPreview(sample); }}
                                                className={`p-2 rounded-lg transition-colors ${playingPath === sample.path ? 'bg-green-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                                title={playingPath === sample.path ? "Stop" : "Preview"}
                                            >
                                                {playingPath === sample.path ? <Pause size={16} fill="black" /> : <Play size={16} fill="none" />}
                                            </button>
                                            <button 
                                                onClick={() => onSelect(sample)}
                                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                                                title="Select"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <h4 className="font-bold text-slate-200 text-sm truncate mb-1" title={sample.name}>{sample.name}</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-500 font-mono">.{sample.ext}</span>
                                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{sample.category}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 p-8 flex flex-col items-center justify-center text-center gap-6">
                        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full max-w-lg shadow-xl">
                            <h3 className="text-xl font-bold text-white mb-2">Import from URL</h3>
                            <p className="text-slate-400 text-sm mb-6">Paste a direct link to an audio file (mp3, wav, etc.) to use it without downloading.</p>
                            
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="https://example.com/drum-hit.mp3" 
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                    value={onlineUrl}
                                    onChange={(e) => setOnlineUrl(e.target.value)}
                                />
                                <button 
                                    onClick={handleOnlineLoad}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold transition-colors"
                                >
                                    Load
                                </button>
                            </div>
                        </div>

                        <div className="text-left max-w-lg w-full">
                            <h4 className="font-bold text-slate-300 mb-2 text-sm uppercase">Free Resources (Copy links from here)</h4>
                            <ul className="space-y-2 text-sm text-slate-400">
                                <li><a href="https://freesound.org" target="_blank" className="text-indigo-400 hover:underline">Freesound.org</a> (Right click download button -&gt; Copy Link)</li>
                                <li><a href="https://commons.wikimedia.org/wiki/Category:Audio_files" target="_blank" className="text-indigo-400 hover:underline">Wikimedia Commons</a></li>
                                <li><a href="https://archive.org/details/audio" target="_blank" className="text-indigo-400 hover:underline">Internet Archive</a></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-600">Tip: You can use MIDI and Omnisphere patches too! They will be mapped to the pad but won't preview here.</p>
                </div>
            </div>
        </div>
    );
};