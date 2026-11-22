const stages = [
  { number: "01", title: "Write event", detail: "Express REST API validates the match or commentary payload.", tech: "POST /matches" },
  { number: "02", title: "Commit safely", detail: "Match data and its outbox event are written in one transaction.", tech: "PostgreSQL · outbox" },
  { number: "03", title: "Distribute", detail: "The relay publishes committed events; consumers fan them into Redis.", tech: "Kafka · match-events" },
  { number: "04", title: "Broadcast", detail: "Redis pub/sub delivers the event to subscribed WebSocket clients.", tech: "Redis · /ws" },
];

export function BroadcastFlow() {
  return (
    <section className="engine-panel mt-6" aria-labelledby="engine-title">
      <div className="engine-heading">
        <div>
          <span className="engine-kicker">How the engine moves an event</span>
          <h2 id="engine-title" className="engine-title">One write. Every subscriber.</h2>
          <p className="engine-description">Follow a commentary post from the API to the match room. The event moves asynchronously after the database transaction commits.</p>
        </div>
        <span className="engine-live"><span /> EVENT DELIVERY PATH</span>
      </div>
      <ol className="engine-flow">
        {stages.map((stage, index) => (
          <li className="engine-stage" key={stage.number}>
            <div className="engine-stage-top"><span className="engine-number">{stage.number}</span>{index < stages.length - 1 && <span className="engine-arrow" aria-hidden="true">→</span>}</div>
            <h3>{stage.title}</h3>
            <p>{stage.detail}</p>
            <code>{stage.tech}</code>
          </li>
        ))}
      </ol>
      <div className="engine-footnote"><span className="engine-dot" /> Durable broadcasts require Kafka to be configured. If PostgreSQL persistence fails, this backend has an in-memory store path with direct WebSocket delivery.</div>
    </section>
  );
}
