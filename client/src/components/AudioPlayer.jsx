import { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';

// Custom audio player used for voice/audio messages, replacing the browser's
// bare native <audio controls> element (which renders inconsistently and
// collapses to almost nothing at small widths).
const AudioPlayer = ({ src }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        // Chrome/webm recordings are often written without a valid duration in
        // the container header. Seeking to a huge time and back forces the
        // browser to recompute the real duration from the actual media data.
        const handleLoadedMetadata = () => {
            if (audio.duration === Infinity || isNaN(audio.duration)) {
                const onTimeUpdate = () => {
                    audio.removeEventListener('timeupdate', onTimeUpdate);
                    setDuration(audio.duration === Infinity || isNaN(audio.duration) ? 0 : audio.duration);
                    audio.currentTime = 0;
                };
                audio.addEventListener('timeupdate', onTimeUpdate);
                audio.currentTime = 1e101;
            } else {
                setDuration(audio.duration);
            }
        };

        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e) => {
        const audio = audioRef.current;
        const newTime = parseFloat(e.target.value);
        if (!audio || isNaN(newTime)) return;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const formatTime = (secs) => {
        if (!secs || isNaN(secs) || secs < 0) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const progress = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div className="audio-player">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button type="button" className="audio-play-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <input
                type="range"
                className="audio-seek"
                min="0"
                max={duration || 0}
                step="0.01"
                value={currentTime}
                onChange={handleSeek}
                style={{ '--progress': `${progress}%` }}
            />

            <span className="audio-time">
                {formatTime(currentTime)} / {formatTime(duration)}
            </span>
        </div>
    );
};

export default AudioPlayer;