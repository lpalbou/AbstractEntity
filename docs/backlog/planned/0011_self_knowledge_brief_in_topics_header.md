# Planned: "What do you know": the self-knowledge brief, shown in the Topics header

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"what do you know" is answered from records, not topics; the runtime brief addresses
discoverability; the app shows the brief in the Topics header next wave.

## Current code reality
`src/topics_panel.tsx`: the panel's head names the topics and counts; nothing shows a summary of
what the entity knows of itself. The brief does not exist yet (runtime work).

## Dependencies and related tasks
Root `docs/backlog/planned/1197_self_knowledge_brief_in_the_entity_prefix.md` (AbstractRuntime
writes the brief at sleep and puts it in the prompt prefix; this app shows it).

## Scope
Once the gateway serves the brief: its text in the Topics panel header (folded to two lines, open
on click), with its date.

## Non-goals
No brief composed in the app.

## Expected outcomes
He and the operator see what the entity believes it knows, next to its topics.

## Validation
A topics_panel test on a served brief and on none (the head unchanged); a 400 px screenshot.

## Size
S (half a day, after 1197).
