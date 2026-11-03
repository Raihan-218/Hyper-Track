# Mobile offline architecture audit and implementation plan

## Audit findings (2026-11-03)

- The current mobile client routes feature reads and writes through `src/lib/api.ts`, but screens and orchestration remain in `app/index.tsx`.
- Successful GET responses are cached in AsyncStorage under request paths. That cache is not structured by account and is cleared on logout. A network failure can fall back to this cache.
- The existing durable queue stores only task and habit creates in AsyncStorage. It flushes before GETs, discards some client errors, has no backoff/status UI, and does not cover updates, completion, delete/archive, goals, projects, profile, or focus sessions.
- The access and refresh tokens are held in SecureStore on native. A cached `/auth/me` response can be retained, but the current bootstrap does not distinguish an offline session from an expired/unauthenticated session.
- Existing application data and historical facts remain authoritative on the API. Tasks and habits have history/snapshot models; XP awards are created server-side. The mobile client currently cannot authoritatively calculate analytics or XP without the API.
- No SQLite or NetInfo dependency existed. The installed Expo SDK 58 compatibility map specifies `expo-sqlite ~58.0.15` and `@react-native-community/netinfo 12.0.1`.
- API writes are feature-specific REST requests. Only task and habit creates currently accept a client mutation ID; there is no general synchronization endpoint or server idempotency protocol. Blindly replaying arbitrary writes would risk duplicate side effects and is not safe.

## Proposed local schema

SQLite is device persistence, scoped by authenticated account ID. Version 1 adds tables for cached user profile; tasks and subtasks via parent references; projects; goals and milestones; habits and local completion facts; task completion facts; focus sessions; XP transactions; progress snapshots; a retryable outgoing queue; sync metadata; and raw API cache compatibility. Domain rows retain their source payload to preserve current API contracts while normalized columns support local relationships and queries. Schema upgrades must be additive and versioned. No startup path drops data.

## Synchronization and conflict policy

Do not replay a mutation until a backend idempotency contract exists for that operation. Stable event/mutation IDs must be persisted locally and recognized server-side. Completion and XP history are event facts; conflict handling must preserve distinct events and deduplicate only the same event ID. Entity edits need version/ETag or deterministic server revisions, and deletions need tombstones. Pending local writes must take precedence over a cloud snapshot for the same entity until acknowledgement. Current backend routes do not yet provide incremental change feeds, revisions, or generic idempotency; these are prerequisites for a production sync engine.

## Delivery status (2026-11-03)

- **Phase 1:** audit and SDK compatibility documented.
- **Phase 2:** implemented SQLite v1 with additive migration, foreign-key/index support, user-scoped cache and retry queue. Existing AsyncStorage path cache and task/habit create queue are imported without deleting a source entry until its SQLite copy is durable. Web and Node test adapters remain separate from the native SQLite runtime.
- **Phase 3:** added durable cache/outbox transactions and local transformations for task, habit, project, goal, milestone, profile, and focus writes. The existing screen still calls the API facade directly; a full feature repository/service extraction has not been completed.
- **Phase 4:** dashboard cache hydration, scoped offline reads, optimistic local mutations and offline status/pending count UI are connected. Offline XP and historical analytics remain server-authoritative; no local values are fabricated.
- **Phase 5:** added reconnect, foreground, request and manual outbox triggers with persisted exponential retry, acknowledgement and idempotency headers. The queue preserves FIFO dependencies and pauses later operations while an earlier operation backs off. Only operations covered by routes' stable-ID or naturally idempotent contracts are safe to replay; delete 404 is acknowledged.
- **Phase 6:** added stable IDs / duplicate-create handling to task, habit, project, goal, milestone and focus creation. A general server change feed, versioned conflict protocol, and tombstones are still absent. Current server refresh remains feature GETs; this is not a cross-device incremental sync engine.
- **Phase 7:** added user-scoped cache isolation and safe legacy cache/queue import. Full dataset migration tooling and account-switch acceptance testing remain outstanding.
- **Phase 8:** mobile/API typechecks and test suites, Expo config validation, web export, and Android native compilation were run. Android install, launch and end-to-end offline/reconnect verification require a working ADB device; this session's ADB server failed to start.

The current delivery is a durable offline cache plus a bounded outbox for supported writes, not a complete production-grade offline-first sync system. Before claiming full acceptance, add server revisions/change feed/tombstones, resolve conflict semantics, extract screen operations behind repositories, and verify the real-device persistence and replay workflow.

## Delivery sequence

1. Audit and document API/data ownership, migration risks, and dependency compatibility. **Done.**
2. Add persistent SQLite initialization, additive schema versioning, account-scoped cache and durable queue foundations. **Implemented; runtime persistence still needs device verification.**
3. Add feature repositories and make local transactions the write boundary; migrate existing AsyncStorage caches without deleting source data. **Partial: local mutations and legacy cache import exist, but repositories/service boundary extraction remains.**
4. Move screen operations behind feature services/repositories and provide immediate offline reads and optimistic local writes. **Partial: API facade provides cache hydration and supported optimistic writes.**
5. Add NetInfo/foreground/manual sync triggers, status UI, bounded retry and resumable synchronization. **Implemented for queued requests, subject to endpoint idempotency coverage.**
6. Add backend authenticated batch/incremental sync, idempotency, revisions, tombstones and XP event deduplication. **Partial: stable create IDs/idempotent create handling exist; incremental changes, version conflicts and tombstones do not.**
7. Add safe import of existing server/cache data with resumable migration and account isolation. **Partial: legacy AsyncStorage cache/queue import exists; no full database migration/reconciliation workflow.**
8. Add unit/integration coverage, Expo/native validation and device verification. **Automated checks passed; live Android acceptance remains.**

Do not describe the current product as fully offline-first until the remaining phase work and device acceptance are complete.
