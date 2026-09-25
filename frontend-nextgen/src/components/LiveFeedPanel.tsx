import { FeedEvent } from '../stores/feedStore';

interface LiveFeedPanelProps {
  events: FeedEvent[];
  connected: boolean;
  entityId: string | undefined;
}

export const LiveFeedPanel = ({ events, connected, entityId }: LiveFeedPanelProps) => {
  const filteredEvents = events.filter((e) => e.source === entityId || e.source === 'system');

  return (
    <div className="live-feed-panel">
      <div className="feed-header">
        <h3>Live Feed</h3>
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`}></span>
      </div>
      <div className="feed-stream">
        {filteredEvents.length === 0 && <p className="muted">No live events for this entity.</p>}
        {filteredEvents.map((evt) => (
          <div key={evt.id} className={`feed-item ${evt.type}`}>
            <span className="feed-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
            <span className="feed-source">{evt.source}</span>
            <span className="feed-msg">{evt.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};