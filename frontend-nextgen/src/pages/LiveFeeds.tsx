import { useEffect, useRef } from 'react';
import { useFeedStore } from '../stores/feedStore';

const LiveFeeds = () => {
  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);
  const clear = useFeedStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const iconForType = (type: string) => {
    switch (type) {
      case 'tool': return '🔧';
      case 'monologue': return '💭';
      case 'system': return '⚡';
      default: return '📋';
    }
  };

  return (
    <div className="page live-feeds-page">
      <div className="feed-controls">
        <h1>Live Feeds</h1>
        <div className="feed-actions">
          <span className={`connection-status ${connected ? 'online' : 'offline'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button onClick={clear}>Clear</button>
        </div>
      </div>
      <div className="feed-container">
        {events.length === 0 && (
          <div className="empty-state">
            <p>Waiting for live events from agents...</p>
            <p className="muted">Events will stream here in real-time via WebSocket.</p>
          </div>
        )}
        {events.map((evt) => (
          <div key={evt.id} className={`feed-entry ${evt.type}`}>
            <div className="feed-entry-header">
              <span className="feed-icon">{iconForType(evt.type)}</span>
              <span className="feed-source">{evt.source}</span>
              <span className="feed-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="feed-entry-body">{evt.message}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LiveFeeds;
