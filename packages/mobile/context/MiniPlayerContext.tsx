import React, { createContext, useContext, useState, useCallback } from "react";

export interface MiniPlayerVideo {
  id: string;
  title: string;
  channelName: string;
  thumbnail: string;
}

interface MiniPlayerContextType {
  current: MiniPlayerVideo | null;
  isPlaying: boolean;
  setCurrent: (v: MiniPlayerVideo | null) => void;
  setIsPlaying: (v: boolean) => void;
  play: (v: MiniPlayerVideo) => void;
  dismiss: () => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextType>({
  current: null,
  isPlaying: false,
  setCurrent: () => {},
  setIsPlaying: () => {},
  play: () => {},
  dismiss: () => {},
});

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<MiniPlayerVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback((v: MiniPlayerVideo) => {
    setCurrent(v);
    setIsPlaying(true);
  }, []);

  const dismiss = useCallback(() => {
    setCurrent(null);
    setIsPlaying(false);
  }, []);

  return (
    <MiniPlayerContext.Provider value={{ current, isPlaying, setCurrent, setIsPlaying, play, dismiss }}>
      {children}
    </MiniPlayerContext.Provider>
  );
}

export function useMiniPlayer() {
  return useContext(MiniPlayerContext);
}
