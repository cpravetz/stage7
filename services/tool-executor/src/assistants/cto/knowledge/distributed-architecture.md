# Distributed Architecture Patterns

Reference material for `cto-architecture-advisory` and `cto-architecture-tech-debt-evaluator`. The advisory takes a `system`, a list of `requirements`, and a `context` block of `teamSize`, `currentStack`, `constraints`, `timeline`, and `scale`, and returns `recommendations`, `risks`, and `decisions`. The evaluator takes `systems` scored 0–5 on `reliability`, `security`, `scalability`, `maintainability`, and `cost`, and produces a ranked modernization roadmap. Both reason from the patterns below, and both need the same discipline: state the trade-off, name the alternative rejected, and record it as a decision.

## The styles

| Style | Shape | Use when | Cost you accept |
| --- | --- | --- | --- |
| Monolith | One deployed unit, internally layered | Early product, uncertain domain, small team | Coordination cost grows with the codebase, not the org |
| Modular monolith | One deploy, explicit internal boundaries enforced by the build | Teams want microservice boundaries but not the ops load | Discipline degrades without build-time enforcement |
| Microservices | Independently deployable services around business capabilities | Multiple teams, genuinely different release cadences | Network calls, distributed transactions, observability cost |
| Serverless | Functions, managed scaling, pay per invocation | Spiky or event-driven load, small units of work | Cold starts, vendor coupling, hard limits on duration and state |
| Event-driven | Producers publish facts; consumers react | Loose coupling, audit trails, many downstream consumers | Eventual consistency, hard debugging, schema governance |
| Layered / n-tier | Presentation, business, data access | Almost everything, always, including inside a service | Tends to blur without enforced direction of dependencies |

The patterns catalogue shipped with the assistant (`architecture-patterns.json`) recognises `microservices`, `monolith`, `serverless`, `event-driven`, and `layered`, and maps common technologies to a style: Kubernetes and Docker to microservices, managed functions to serverless, message brokers and event streams to event-driven, MVC and DAO conventions to layered. Lean on that mapping when the answer is a technology recommendation; the arguments below are for when it is not.

## Boundaries

- **Bounded context** — a model with its own language and its own invariants. A boundary is wrong when two contexts must share a table; a table is a boundary.
- **Align to the org.** Conway's law is a cost model, not a law: the inverse (a service boundary per team) is what makes independent deploy real rather than nominal.
- **Decompose on change rate, not on noun count.** "Customer" being large does not make it two services. "Order" changing weekly while "Catalog" changes twice a year does.
- **Anti-corruption layer** when integrating a system you do not own. Without one, the vendor's model leaks into yours and you have adopted their roadmap.
- **Strangler fig** for migration: put a facade in front, route one capability at a time, delete the old path as each moves. Do not rewrite and cut over.

## Consistency and coupling

- **Synchronous call depth.** Each synchronous hop adds a failure mode and a latency budget. Three hops inside a request path is the practical ceiling; beyond that, make the tail asynchronous.
- **Eventual consistency** is a product decision, not an implementation detail. Write down what a user sees during the propagation window, and put it in the PRD's `openQuestions` if nobody has.
- **Saga over distributed transaction.** Each step has a compensating action; every saga has a documented compensating action for every step, written before the code.
- **Idempotency at every boundary.** Retries are mandatory in any distributed system; without an idempotency key, the retry is a duplicate charge, a duplicate email, or a duplicate order.
- **Timeouts are budgets, not values.** A downstream timeout must be shorter than the caller's own, or the caller dies before the callee reports. Set them in one place, from one table.
- **Backpressure and bounded queues.** An unbounded queue converts a traffic spike into an outage three components downstream.

## Resilience

- **Timeouts, retries with exponential backoff and jitter, and circuit breakers** on every remote call. Retries without backoff turn a partial outage into a total one.
- **Bulkheads** — separate thread pools, connection pools, and concurrency limits per dependency, so one slow service cannot consume everything.
- **Load shedding** — a deliberate, tested rejection path. A graceful degraded response beats a queue that grows until the process dies.
- **Health endpoints that mean something.** A liveness probe that checks dependencies turns a partial outage into a restart storm.
- **Multi-AZ by default, multi-region by exception.** Multi-region is a cost and an operational decision, not a checkbox.
- **RTO and RPO per service**, tested. `cto-disaster-recovery-planner` assesses against targets of 60 minutes RTO and 15 minutes RPO by default, and marks a system `needs-action` when either is missed or when `backupVerified` is false.

## Observability

- **Structured logs, metrics, and traces, correlated by one request id** carried through every hop. Three signals that cannot be joined are three separate investigations.
- **RED for request paths** (rate, errors, duration), USE for resources (utilisation, saturation, errors).
- **Instrument the business event, not just the endpoint.** "Checkout completed" with a value attached is the metric that matters during an incident.
- **SLOs per service, with an error budget.** A deploy is gated on budget consumption, not on a subjective readiness call. A 99.9% SLO gives roughly 43 minutes of monthly unavailability; a 99% SLO gives about 7 hours. The difference decides whether on-call is survivable.
- **Alert on symptoms.** Page on user-visible impact; ticket the causes.

## Data and events

- **CQRS** — separate the write model from the read model when they diverge materially. It buys cheap, shaped reads at the cost of a projection to keep correct. Not worth it for CRUD.
- **Event sourcing** — the event log is the source of truth; state is a projection. Justified for audit trails, financial history, and domains where "what did the state look like at time T" is a real question. Expensive: schema evolution, replay, and privacy deletion all become hard problems. Adopt deliberately or not at all.
- **Transactional outbox** — write the event and the state in one local transaction, relay asynchronously. The standard fix for the dual-write problem.
- **Schema registry with compatibility rules** for any event that crosses a service boundary. Consumers exist that you do not know about.
- **Outbox relay lag is a metric worth alerting on.** It is the delay between the write and the world knowing.

## Decision records

Every non-obvious choice gets an Architecture Decision Record:

- **Context** — the forces at play, including the ones that argue against the decision.
- **Decision** — what was chosen, stated as a fact.
- **Alternatives** — what was rejected and why. This is the section that saves the argument six months later.
- **Consequences** — what becomes easy, what becomes hard, and what you now owe.
- **Status** — proposed, accepted, superseded, with a date.

Statuses: proposed, accepted, deprecated, superseded. A deprecated ADR is not deleted; it points at its replacement. `cto-architecture-advisory` returns `decisions` as `{ topic, decision, alternatives[] }` — that is the shape an ADR record should take, and the alternatives list is the part most worth keeping.

## Scoring systems for modernization

`cto-architecture-tech-debt-evaluator` scores each supplied system and weights the components:

| Component | Weight | What a high score means here |
| --- | --- | --- |
| `reliability` | 3 | Frequent incidents, missed SLOs, brittle dependencies |
| `security` | 3 | Weak isolation, unpatched surface, poor auditability |
| `scalability` | 2 | Cannot meet the growth envelope without a redesign |
| `maintainability` | 2 | Slow to change, high defect density, hard to test |
| `cost` | 1 | Run cost disproportionate to the value delivered |

```
score = 3*reliability + 3*security + 2*scalability + 2*maintainability + 1*cost
```

Each input is 0–5, so the maximum is 55. Bands: `>= 18` high priority ("modernize now"), `>= 12` medium ("schedule next quarter"), otherwise low ("monitor"). The roadmap is the scored list sorted descending with a 1-based `rank`.

Two cautions. The weights encode a view — security and reliability at 3 each, cost at 1 — and that view is a decision, not a fact; if the business is cost-constrained, change the weights rather than arguing with the ranking. And a low score on everything is not an argument for a rewrite; it is an argument for leaving it alone, which is a legitimate and underused roadmap entry.

## Common anti-patterns

- **Distributed monolith** — microservices that must be deployed together. All of the cost of distribution, none of the benefit.
- **Chatty services** — many small calls where one would do.
- **Shared database across services** — the boundary is fictional.
- **Premature event sourcing** — replay complexity adopted before the model is understood.
- **Microservices on a team of three** — every boundary becomes a coordination overhead with no parallelism to buy.
- **Resilience theatre** — a circuit breaker that was never tested by opening the circuit.
- **Platform without a platform team.** Nobody owns the paved road, so nobody uses it.

## Choosing between synchronous and asynchronous

The most consequential decision in a service design, and the one most often made by default. The question is never "is async better" — it is whether the caller needs an answer now.

| | Synchronous call | Asynchronous message |
| --- | --- | --- |
| Caller needs the result to continue | Yes | No |
| Availability couples the two | Yes — the caller fails when the callee does | No — the caller continues regardless |
| Latency | Sums along the path | One hop, then decoupled |
| Consistency | Immediate within the boundary | Eventual, with a propagation window |
| Debugging | Follow the call stack | Follow a correlation id across producers and consumers |
| Failure handling | Retry or fail the request | Retry, dead-letter, and replay |

Use synchronous when the caller genuinely cannot proceed — a validation check, a pricing calculation, an authorisation decision. Use asynchronous when the work is "eventually" important: send the email, update the analytics row, refresh the search index, notify the downstream warehouse. The default in most systems is synchronous, and that default accumulates into the deep call chains that turn a partial outage into a total one.

**The distributed monolith** is the classic result: services deployed independently but calling each other synchronously on every request, so they still have to be released together. Independent deployability was the goal and it was not achieved, at full cost. The signal is a release train.

## The service template

What a service should have documented before it ships, regardless of implementation:

- **Owns** — the data it is the source of truth for, and the tables it must not touch.
- **Contract** — the requests it accepts and the events it emits, with schemas and compatibility rules.
- **Depends on** — every downstream service, with the timeout budget each is allowed.
- **SLO** — availability and latency target, and the error budget that follows.
- **Failure behaviour** — what it does when each dependency is slow or down. For every dependency, an answer.
- **Owners** — the team, the on-call rotation, the escalation path.
- **Data classification** — what PII it holds, where it is replicated, and how it is deleted.

A service without the failure-behaviour line is the one that takes the estate down at 02:00, because nobody wrote down what it should do when the payment provider stops answering.

## Where the patterns stop

- **Event sourcing without a reason.** Replay complexity, schema evolution, and privacy deletion all become hard problems. Adopt it for audit trails, financial history, and domains where the historical state genuinely matters; do not adopt it because it is elegant.
- **CQRS on CRUD.** Separate read and write models cost a projection to keep correct. Buy it when reads and writes diverge materially, not preemptively.
- **A service mesh before there is a service problem.** The mesh automates what you could already do, and adds a layer to debug.
- **Multi-region before multi-AZ.** Multi-region is a cost, an operational discipline, and a data-consistency decision. It is not a scaling step.

## Configuring this

The 0–5 score range, the 3/3/2/2/1 weights, and the 18 and 12 priority bands are the evaluator's compiled defaults; the RTO and RPO targets, the weighting, the bands, and the priority-to-action mapping are yours to change. An operator overrides them in the assistant's persisted configuration for `cto-architecture-tech-debt-evaluator` and `cto-architecture-advisory` — the runtime merges each skill's `configSchema` defaults with saved values, and the `context` block on the advisory is the per-run route for team size, current stack, constraints, timeline, and scale. Record the weights you actually use in an ADR alongside the decision they justify, so a future reader can tell a considered prioritisation from a default.
