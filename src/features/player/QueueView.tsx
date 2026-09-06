import { useNavigate } from "react-router-dom";
import type { DragEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { usePlayerStore } from "@core/player/audioService";
import { IconButton, JButton, Section, TrackRow, icons } from "@shared/ui";

export function QueueView() {
  const navigate = useNavigate();
  const player = usePlayerStore();
  const [isExiting, setIsExiting] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const currentItemRef = useRef<HTMLDivElement | null>(null);
  const currentIndex = player.currentTrack
    ? player.queue.findIndex((track) => track.id === player.currentTrack?.id)
    : -1;

  const exitQueue = () => {
    setIsExiting(true);
    window.setTimeout(() => navigate(-1), 220);
  };

  useLayoutEffect(() => {
    if (!currentItemRef.current) return;
    currentItemRef.current.scrollIntoView({ block: "start", behavior: "auto" });
  }, [currentIndex, player.queue.length]);

  const saveQueue = async () => {
    const name = window.prompt("Playlist name", `JellyCat Queue ${new Date().toLocaleDateString()}`);
    if (!name?.trim()) return;
    setQueueMessage("SAVING QUEUE");
    try {
      await player.saveQueueAsPlaylist(name.trim());
      setQueueMessage("QUEUE SAVED");
    } catch {
      setQueueMessage("SAVE FAILED");
    }
  };

  const finishDrag = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    setDragOverIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const dragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const dropQueueItem = (event: DragEvent<HTMLDivElement>, destination: number) => {
    event.preventDefault();
    const transferredIndex = Number(event.dataTransfer.getData("text/plain"));
    const source = draggedIndex ?? transferredIndex;
    finishDrag();

    if (!Number.isInteger(source) || source === destination || source < 0 || source >= player.queue.length) return;
    player.moveQueueItem(source, destination);
  };

  return (
    <main className={`screen queue-screen ${isExiting ? "exiting" : ""}`}>
      <div className="topbar">
        <h1>QUEUE</h1>
        <div className="topbar-actions queue-header-actions">
          <JButton icon={icons.playlist} onClick={() => void saveQueue()} disabled={!player.queue.length}>SAVE</JButton>
          <JButton accent icon={icons.trash} onClick={player.clearQueue}>CLEAR</JButton>
          <JButton icon={icons.filter} onClick={player.clearPlayed} disabled={currentIndex <= 0}>CLEAR PLAYED</JButton>
        </div>
        <span className="spacer" />
        <IconButton label="Back" icon={icons.back} onClick={exitQueue} />
      </div>
      <Section title="QUEUE :: CURRENT" action={queueMessage || `// ${currentIndex + 1 || 0} / ${player.queue.length} TRACKS`} />
      {!player.queue.length && player.lastQueueSnapshot ? (
        <div className="feature-panel">
          <div>
            <strong>LAST QUEUE</strong>
            <p>{player.lastQueueSnapshot.queue.length} tracks / {new Date(player.lastQueueSnapshot.createdAt).toLocaleString()}</p>
          </div>
          <JButton icon={icons.play} onClick={() => player.restoreQueueSnapshot(player.lastQueueSnapshot!)}>RESTORE</JButton>
        </div>
      ) : null}
      {player.queue.length ? player.queue.map((track, index) => (
        <div
          key={`${track.id}-${index}`}
          ref={index === currentIndex ? currentItemRef : undefined}
          className={`queue-item ${index === currentIndex ? "current" : ""} ${index === draggedIndex ? "dragging" : ""} ${index === dragOverIndex && draggedIndex !== null ? "drag-over" : ""}`}
          draggable
          onDragStart={(event) => startDrag(event, index)}
          onDragOver={(event) => dragOver(event, index)}
          onDrop={(event) => dropQueueItem(event, index)}
          onDragEnd={finishDrag}
        >
          <TrackRow
            track={track}
            index={index}
            contextTracks={player.queue}
            artworkSize={114}
            className="queue-track-row"
            onRemoveFromQueue={() => player.removeFromQueue(index)}
          />
        </div>
      )) : <div className="empty-state">// QUEUE EMPTY</div>}
      {player.queueHistory.length ? (
        <>
          <Section title="QUEUE :: HISTORY" />
          <div className="compact-track-list">
            {player.queueHistory.map((snapshot) => (
              <button key={snapshot.id} type="button" className="settings-row compact-track-row" onClick={() => player.restoreQueueSnapshot(snapshot)}>
                <span>{snapshot.name.toUpperCase()}</span>
                <span className="spacer" />
                <span>{snapshot.queue.length} tracks</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
