# AbstractEntity backlog overview

The Entity app's planning memory: what is planned, proposed and done for the browser app that
shows an entity's life (graph, ledger, topics, chat). Package-wide or cross-package work lives in
the root backlog (`abstractframework/docs/backlog/`); an item here names its root counterpart.

## Counts

| State | Count |
| --- | --- |
| Planned | 12 |
| Proposed | 6 |
| Completed | 2 |
| Deprecated | 0 |

## Next recommended work

From the operator's test of 0.12.0 (2026-11-10), next wave: 0002 (topic hover lights its
community) and 0003 (animated camera) together, then 0001 (panel at the top right), 0004 (legend),
0005 (members by type). 0010, 0011 and 0012 follow their root items (1196, 1197, 1195). 0006 needs
an investigation first.

## Planned

| ID | Item | Size | Root item |
| --- | --- | --- | --- |
| 0001 | [Topics panel starts at the top right](planned/0001_topics_panel_starts_top_right.md) | S-M | |
| 0002 | [Hovering a topic highlights its community](planned/0002_topic_hover_highlights_its_community.md) | M | |
| 0003 | [Topic focus: animated camera, never a teleport](planned/0003_topic_focus_animated_camera.md) | S | |
| 0004 | [Legend: two lines at most, interactive](planned/0004_legend_two_lines_and_interactive.md) | M | |
| 0005 | [Topic members grouped by memory type](planned/0005_topic_members_by_memory_type.md) | S-M | |
| 0006 | [Graph polish: no periodic deformation](planned/0006_graph_polish_no_deformation.md) | L | |
| 0007 | [Most used green: a little more contrast](planned/0007_most_used_green_contrast.md) | XS | |
| 0008 | [Hovered neighbourhood: ~20 % more contrast](planned/0008_hover_neighbourhood_contrast.md) | XS | |
| 0009 | [Ledger key: drop the two help lines](planned/0009_ledger_key_two_lines.md) | XS | |
| 0010 | [Live activity panel as actionable feedback](planned/0010_live_activity_panel_actionable.md) | M-L | 1196 |
| 0011 | [Self-knowledge brief in the Topics header](planned/0011_self_knowledge_brief_in_topics_header.md) | S | 1197 |
| 0012 | [Settings screen loads slowly](planned/0012_settings_screen_loads_slowly.md) | S-M | 1195 |

## Proposed (legacy names)

These predate the numbered scheme and keep their dated filenames (renaming is a separate hygiene
pass).

| Item | Promotion criteria |
| --- | --- |
| [Visit wakes the entity when the visitor is authorized](proposed/2026-07-10_visit_wakes_authorized_entity.md) | see item |
| [B5: adopt uic's useGatewayConnection](proposed/2026-07-13_b5_connection_hook_adoption.md) | see item |
| [Durable-visit cutover + reincarnation surfaces](proposed/2026-07-13_durable_visit_cutover.md) | see item |
| [Production-readiness wave, deferred findings](proposed/2026-07-13_production_readiness_deferred.md) | see item |
| [Supervised launch shape (:3007)](proposed/2026-07-13_supervised_launch.md) | see item |
| [Every memory names its ledger sources](proposed/2026-10-27_memory_sources_from_the_ledger.md) | services ship provenance |

## Completed

| ID | Item | Completed | Outcome |
| --- | --- | --- | --- |
| (legacy) | [Kit message footer spec](completed/2026-10-28_kit_message_footer_spec.md) | 2026-10-28 | shipped 0.9.3 |
| (legacy) | [Adopt panel-chat readAloudStep](completed/2026-10-29_adopt_panel_chat_read_aloud_export.md) | 2026-10-29 | shipped |

## Deprecated

None.

## Process

- A new item takes the next unused `NNNN_` prefix (next: 0013) and the template's sections
  (metadata, ADR status, context or the operator's words, current code reality, scope, expected
  outcomes, validation, size).
- Completing an item: set `Status: Completed` and `Completed: <date>`, add what was done and its
  validation, move the file to `completed/`, update the counts and tables here in the same commit.
- Deprecating: move to `deprecated/` with the reason, and list it above.
