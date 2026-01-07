import { useState, useEffect, useCallback, useRef } from 'react';

export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiMessageCallback = (note: number, velocity: number) => void;

export function useMidi() {
  const [inputs, setInputs] = useState<MidiDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [lastNote, setLastNote] = useState<{ note: number; velocity: number } | null>(null);
  const listenersRef = useRef<MidiMessageCallback[]>([]);

  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then(onMIDISuccess)
        .catch(onMIDIFailure);
    } else {
      console.warn('Web MIDI API not supported in this browser.');
    }
  }, []);

  const onMIDISuccess = (access: MIDIAccess) => {
    setMidiAccess(access);
    updateInputs(access);

    access.onstatechange = (e) => {
      // Refresh inputs when devices are connected/disconnected
      updateInputs(e.target as MIDIAccess);
    };
  };

  const onMIDIFailure = () => {
    console.error('Could not access your MIDI devices.');
  };

  const updateInputs = (access: MIDIAccess) => {
    const inputList: MidiDevice[] = [];
    access.inputs.forEach((input: MIDIInput) => {
      inputList.push({
        id: input.id,
        name: input.name || `Unknown Device (${input.id})`,
      });
    });
    setInputs(inputList);

    // Auto-select if only one device or if previously selected device still exists
    if (inputList.length > 0 && !selectedInputId) {
        // Prefer a device with "drum" or "midi" in the name if possible, otherwise first
        const rixton = inputList.find(i => i.name.toLowerCase().includes('rixton'));
        setSelectedInputId(rixton ? rixton.id : inputList[0].id);
    }
  };

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    if (!event.data) return;
    const command = event.data[0];
    const note = event.data[1];
    const velocity = event.data[2];
    
    // Note On message (usually 144-159 range depending on channel)
    // Some devices send Note On with velocity 0 as Note Off
    if (command >= 144 && command <= 159 && velocity > 0) {
      setLastNote({ note, velocity });
      listenersRef.current.forEach(cb => cb(note, velocity));
    }
  }, []);

  useEffect(() => {
    if (!midiAccess || !selectedInputId) return;

    const input = midiAccess.inputs.get(selectedInputId);
    if (input) {
      input.onmidimessage = handleMidiMessage;
    }

    return () => {
      if (input) {
        input.onmidimessage = null;
      }
    };
  }, [midiAccess, selectedInputId, handleMidiMessage]);

  const addListener = useCallback((callback: MidiMessageCallback) => {
    listenersRef.current.push(callback);
    return () => {
      listenersRef.current = listenersRef.current.filter(l => l !== callback);
    };
  }, []);

  return {
    inputs,
    selectedInputId,
    setSelectedInputId,
    lastNote,
    addListener
  };
}
