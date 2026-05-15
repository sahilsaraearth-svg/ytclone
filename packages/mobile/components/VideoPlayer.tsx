/**
 * VideoPlayer — uses expo-av on all platforms (works in Expo Go).
 */
import React from "react";
import { Video, ResizeMode } from "expo-av";

interface VideoPlayerProps {
  dashUrl: string;
  fallbackUrl: string;
  paused: boolean;
  muted: boolean;
  style: any;
  videoRef: any;
  onProgress: (d: { currentTime: number }) => void;
  onLoad: (d: { duration: number }) => void;
  onBuffer: (d: { isBuffering: boolean }) => void;
  onError: () => void;
}

export default function VideoPlayer(props: VideoPlayerProps) {
  const avRef        = React.useRef<any>(null);
  const loadedOnce   = React.useRef(false);   // fire onLoad only once per source

  // play / pause
  React.useEffect(() => {
    if (!avRef.current) return;
    if (props.paused) {
      avRef.current.pauseAsync?.().catch(() => {});
    } else {
      avRef.current.playAsync?.().catch(() => {});
    }
  }, [props.paused]);

  // mute
  React.useEffect(() => {
    avRef.current?.setIsMutedAsync?.(props.muted).catch(() => {});
  }, [props.muted]);

  // reset loadedOnce when source changes
  React.useEffect(() => {
    loadedOnce.current = false;
  }, [props.fallbackUrl]);

  // expose seek + getPosition via videoRef
  React.useEffect(() => {
    if (props.videoRef) {
      props.videoRef.current = {
        seek: (s: number) =>
          avRef.current?.setPositionAsync?.(s * 1000).catch(() => {}),
        getPosition: async () => {
          if (!avRef.current) return 0;
          try {
            const status = await avRef.current.getStatusAsync?.();
            return (status?.positionMillis ?? 0) / 1000;
          } catch { return 0; }
        },
      };
    }
  }, [props.videoRef]);

  return (
    <Video
      ref={avRef}
      source={{ uri: props.fallbackUrl }}
      style={props.style}
      shouldPlay={!props.paused}
      isMuted={props.muted}
      resizeMode={ResizeMode.CONTAIN}
      useNativeControls={false}
      onPlaybackStatusUpdate={(s: any) => {
        if (!s.isLoaded) return;
        // buffer
        if (s.isBuffering !== undefined)
          props.onBuffer({ isBuffering: s.isBuffering });
        // progress
        props.onProgress({ currentTime: (s.positionMillis ?? 0) / 1000 });
        // onLoad — fire only once when duration is known
        if (s.durationMillis && !loadedOnce.current) {
          loadedOnce.current = true;
          props.onLoad({ duration: s.durationMillis / 1000 });
        }
        if (s.error) props.onError();
      }}
    />
  );
}
