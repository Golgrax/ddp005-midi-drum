import React, { useState, useEffect } from 'react';
import { Disc, Play, FastForward, Rewind } from 'lucide-react';

interface DjDecksProps {
    onTrigger?: (note: number) => void;
    activeNote: number | null;
}

export const DjDecks: React.FC<DjDecksProps> = ({ activeNote }) => {
    const [isLeftSpinning, setIsLeftSpinning] = useState(false);
    const [isRightSpinning, setIsRightSpinning] = useState(false);

    // Visual feedback for MIDI hits
    useEffect(() => {
        if (activeNote) {
            if (activeNote % 2 === 0) {
                setIsLeftSpinning(true);
                setTimeout(() => setIsLeftSpinning(false), 200);
            } else {
                setIsRightSpinning(true);
                setTimeout(() => setIsRightSpinning(false), 200);
            }
        }
    }, [activeNote]);

    return (
        <div className="w-full flex flex-col items-center gap-12 py-12 animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col md:flex-row gap-16 items-center justify-center">
                
                {/* Left Deck */}
                <div className="flex flex-col items-center gap-6">
                    <div className={`
                        relative w-64 h-64 rounded-full bg-slate-950 border-8 border-slate-800 shadow-2xl flex items-center justify-center transition-all duration-75
                        ${isLeftSpinning ? 'scale-105 border-indigo-500 shadow-indigo-500/20' : ''}
                    `}>
                        <div className={`w-full h-full rounded-full border-2 border-slate-700/50 flex items-center justify-center animate-spin-slow ${isLeftSpinning ? 'animate-spin-fast' : ''}`}>
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-900">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                            </div>
                            {/* Grooves */}
                            <div className="absolute inset-4 rounded-full border border-slate-800/30" />
                            <div className="absolute inset-8 rounded-full border border-slate-800/30" />
                            <div className="absolute inset-12 rounded-full border border-slate-800/30" />
                        </div>
                        <Disc className="absolute text-slate-800 opacity-20" size={120} />
                    </div>
                    <div className="flex gap-4">
                        <button className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-400"><Rewind size={20} /></button>
                        <button className="p-3 bg-indigo-600 rounded-lg hover:bg-indigo-500 text-white"><Play size={20} /></button>
                        <button className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-400"><FastForward size={20} /></button>
                    </div>
                </div>

                {/* Crossfader */}
                <div className="w-48 h-12 bg-slate-800 rounded-full border-4 border-slate-900 p-1 relative shadow-inner">
                    <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-slate-700 -translate-x-1/2" />
                    <div className="absolute left-1/2 top-1 bottom-1 w-8 bg-slate-200 rounded-md -translate-x-1/2 shadow-lg cursor-pointer" />
                </div>

                {/* Right Deck */}
                <div className="flex flex-col items-center gap-6">
                    <div className={`
                        relative w-64 h-64 rounded-full bg-slate-950 border-8 border-slate-800 shadow-2xl flex items-center justify-center transition-all duration-75
                        ${isRightSpinning ? 'scale-105 border-purple-500 shadow-purple-500/20' : ''}
                    `}>
                        <div className={`w-full h-full rounded-full border-2 border-slate-700/50 flex items-center justify-center animate-spin-slow ${isRightSpinning ? 'animate-spin-fast' : ''}`}>
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-900">
                                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                            </div>
                            {/* Grooves */}
                            <div className="absolute inset-4 rounded-full border border-slate-800/30" />
                            <div className="absolute inset-8 rounded-full border border-slate-800/30" />
                            <div className="absolute inset-12 rounded-full border border-slate-800/30" />
                        </div>
                        <Disc className="absolute text-slate-800 opacity-20" size={120} />
                    </div>
                    <div className="flex gap-4">
                        <button className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-400"><Rewind size={20} /></button>
                        <button className="p-3 bg-purple-600 rounded-lg hover:bg-purple-500 text-white"><Play size={20} /></button>
                        <button className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-400"><FastForward size={20} /></button>
                    </div>
                </div>

            </div>

            {/* Mixer Controls */}
            <div className="grid grid-cols-4 gap-8 bg-slate-800/50 p-8 rounded-3xl border border-slate-700 shadow-xl">
                {['FILTER', 'REVERB', 'DELAY', 'CRUSH'].map(label => (
                    <div key={label} className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-slate-900 border-4 border-slate-700 relative shadow-lg">
                            <div className="absolute top-1 left-1/2 w-1 h-3 bg-indigo-500 rounded-full -translate-x-1/2" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
