# AbstractEntity backlog overview

The Entity app's planning memory: what is planned, proposed and done for the browser app that
shows an entity's life (graph, ledger, topics, chat). Package-wide or cross-package work lives in
the root backlog (`abstractframework/docs/backlog/`); an item here names its root counterpart.

## Counts

| State | Count |
| --- | --- |
| Planned | 26 |
| Proposed | 6 |
| Completed | 9 |
| Deprecated | 0 |

`planned/` holds 30 files: the 26 planned items and four completed records (0002-0005) whose move
to `completed/` is pending. 0001 is folded into 0017 and closes with it.

## Next recommended work

The operator's round-4 test of 0.12.0 (2026-11-10 20:13), four lanes, each in this order:

- **W1** (side tabs, toolbar, timeline): 0029 (side tabs reordered), 0030 (unpressing "topics"
  clears the topic; the chip is one line), 0032 (the monitor opens in the timeline's empty space;
  its explanatory block goes).
- **W2** (canvas: lines, panel frame, motion buttons): 0028 (closed-memories toggle left of fit;
  its removal waits for the operator's word), 0027 (Topics panel: opens top right, drags by its
  head anywhere, resizes toward the corner dragged), 0025 (never-travelled lines dark grey,
  travelled ones pop by use; hover still dims the rest).
- **W3** (Topics panel rows): 0026 (a clicked topic card folds back).
- **W4** (roster, World tab): 0024 (three entities per row on a desktop), 0031 (World tab: two
  clear lines).

Seams: 0027 (W2) and 0026 (W3) touch the same panel; as in round 3, W2 owns the frame
(`.gc_topics`, its head, placement and size), W3 the rows inside `.gc_tp_body`. 0025, 0027 and
0028 share `src/graph_canvas.tsx` (one lane, in order). 0029, 0030 and 0032 share
`src/entity_view.tsx` (one lane). W1 and W4 both edit `src/entity.css`, in disjoint rules (the
dock and timeline vs the roster and the World tab). 0030 (W1) drops one rule in W2's
`src/graph_canvas.css` (`.gc_topic_chip_full`).

Round 3 (0013-0022) is built on main and was what the operator tested in round 4; its records
close after his check. Round 4 revisits three of them: 0027 follows 0017, 0028 follows 0021, 0032
follows 0018.

After the round: 0006 needs an investigation first; 0012 follows root 1195; 0023 (phone canvas
height) is unlaned. 0010 and 0011 have landed code (a82aa10, 036f874, 23570ed for 0010; 222e72e for
0011, shown on the identity card rather than in the Topics header) but their records are not
closed: close them after the operator's check, with 0011's placement stated.

## Planned

| ID | Item | Size | Lane | Root item |
| --- | --- | --- | --- | --- |
| 0001 | [Topics panel starts at the top right](planned/0001_topics_panel_starts_top_right.md) (folded into 0017) | S-M | W2 via 0017 | |
| 0006 | [Graph polish: no periodic deformation](planned/0006_graph_polish_no_deformation.md) | L | | |
| 0010 | [Live activity panel as actionable feedback](planned/0010_live_activity_panel_actionable.md) | M-L | | 1196 |
| 0011 | [Self-knowledge brief in the Topics header](planned/0011_self_knowledge_brief_in_topics_header.md) | S | | 1197 |
| 0012 | [Settings screen loads slowly](planned/0012_settings_screen_loads_slowly.md) | S-M | | 1195 |
| 0013 | [Status sentence never shifts the toolbar; Files, then Settings](planned/0013_status_sentence_never_shifts_toolbar.md) | S | W1 | |
| 0014 | [Topics panel: one tinted card per topic](planned/0014_topics_panel_one_tinted_card_per_topic.md) | S | W3 | |
| 0015 | [Paths most travelled: hover and click](planned/0015_paths_most_travelled_interactive.md) | M | W3 | |
| 0016 | [Memory types: one collapsed sub-panel](planned/0016_memory_types_one_collapsed_sub_panel.md) | M | W3 | |
| 0017 | [Topics panel floatable and resizable](planned/0017_topics_panel_floatable_resizable.md) | M-L | W2 | |
| 0018 | [Cognitive monitor with the timeline, not the side rail](planned/0018_cognitive_monitor_with_the_timeline.md) | M-L | W1 | |
| 0019 | [Filter chips row removed; the legend replaces it](planned/0019_filter_chips_row_removed_legend_replaces_it.md) | M | W1 | |
| 0020 | [Remove reset, keep fit](planned/0020_remove_reset_keep_fit.md) | XS | W2 | |
| 0021 | [Hidden-records toggle: closed memories](planned/0021_hidden_records_toggle_names_closed_memories.md) | S-M | W2 | |
| 0022 | [Remove the blueprint page](planned/0022_remove_the_blueprint_page.md) | M | W1 | 1200 |
| 0023 | [On a phone the graph and the ledger get at least half the screen](planned/0023_phone_canvas_chrome_height.md) | M | | |
| 0024 | [Roster: at least three entities per row on a desktop](planned/0024_roster_three_entities_per_row.md) | S | W4 | |
| 0025 | [Graph: never travelled dark grey, travelled pops by use; hover still dims](planned/0025_graph_edges_unvisited_grey_visited_pop.md) | M | W2 | |
| 0026 | [A clicked topic card folds back](planned/0026_topic_cards_fold_back.md) | S | W3 | |
| 0027 | [Topics panel: top right, drag by its head anywhere, resize toward the corner](planned/0027_topics_panel_top_right_drag_head_resize_corner.md) | M | W2 | |
| 0028 | [Closed-memories toggle left of fit; its removal waits for the operator](planned/0028_closed_memories_toggle_left_of_fit.md) | XS (S if removed) | W2 | |
| 0029 | [Side tabs: chat, card, health, book, world, lessons, detail, ledger](planned/0029_side_tabs_reordered.md) | XS | W1 | |
| 0030 | [Unpressing "topics" clears the topic; the chip is one line](planned/0030_topics_off_clears_topic_chip_one_line.md) | XS-S | W1 | |
| 0031 | [World tab: two clear lines on top](planned/0031_world_tab_intro_two_lines.md) | XS | W4 | |
| 0032 | [The monitor opens in the timeline's empty space; its explanatory block goes](planned/0032_monitor_in_the_timeline_empty_space.md) | M | W1 | |
| 0034 | [P1: the graph draws only when something changed; at rest it idles](planned/0034_graph_draw_loop_idles.md) | M | | |

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
| 0007 | [Most used green: a little more contrast](completed/0007_most_used_green_contrast.md) | 2026-11-10 | trivial fix, 0.12.0 changelog |
| 0008 | [Hovered neighbourhood: ~20 % more contrast](completed/0008_hover_neighbourhood_contrast.md) | 2026-11-10 | trivial fix, 0.12.0 changelog |
| 0009 | [Ledger key: drop the two help lines](completed/0009_ledger_key_two_lines.md) | 2026-11-10 | trivial fix, 0.12.0 changelog |
| 0002 | [Hovering a topic highlights its community](planned/0002_topic_hover_highlights_its_community.md) (file still under planned/, move pending) | 2026-11-10 | built 3adccc8, f6c2b77, 43be8a1; CHANGELOG [Unreleased] |
| 0003 | [Topic focus: animated camera](planned/0003_topic_focus_animated_camera.md) (file still under planned/, move pending) | 2026-11-10 | built 1af01a3, 43be8a1; CHANGELOG [Unreleased] |
| 0004 | [Legend: two lines at most, interactive](planned/0004_legend_two_lines_and_interactive.md) (file still under planned/, move pending) | 2026-11-10 | built 4d2ee64; CHANGELOG [Unreleased] |
| 0005 | [Topic members grouped by memory type](planned/0005_topic_members_by_memory_type.md) (file still under planned/, move pending) | 2026-11-10 | built 97a1650; CHANGELOG [Unreleased] |

## Deprecated

None.

## Process

- A new item takes the next unused `NNNN_` prefix (next: 0035) and the template's sections
  (metadata, ADR status, context or the operator's words, current code reality, scope, expected
  outcomes, validation, size).
- Completing an item: set `Status: Completed` and `Completed: <date>`, add what was done and its
  validation, move the file to `completed/`, update the counts and tables here in the same commit.
- Deprecating: move to `deprecated/` with the reason, and list it above.
