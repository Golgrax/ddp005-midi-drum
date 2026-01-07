import React, { useEffect, useState } from 'react';

interface DrumPadProps {
  name: string;
  notes: number[];
  isActive: boolean;
  color?: string;
}

export const DrumPad: React.FC<DrumPadProps> = ({ name, isActive, color = 'bg-gray-700' }) => {
  const [activeState, setActiveState] = useState(false);

  useEffect(() => {
    if (isActive) {
      setActiveState(true);
      const timer = setTimeout(() => setActiveState(false), 150);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div
      className={`
        w-24 h-24 m-2 rounded-full flex items-center justify-center text-white font-bold select-none transition-all duration-75 border-4
        ${activeState ? 'scale-110 border-white shadow-[0_0_20px_rgba(255,255,255,0.6)]' : 'border-transparent shadow-md'}
        ${activeState ? 'bg-opacity-100' : 'bg-opacity-80'}
        ${color}
      `}
    >
      {name}
    </div>
  );
};
