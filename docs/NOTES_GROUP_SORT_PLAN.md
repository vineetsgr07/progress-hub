# Notes view: group + sort (two levels)

## Call

Ship **Group by** (Project | Priority | None) → soft collapsible sections; **Then sort** orders cards inside each section. Exactly two levels — no nested subgroup headers.

## Model

1. Group by → sections
2. Then sort → order within each section (updated / priority / project; same-key as group falls back to updated)


## Why

- Notes already have `projectTag` + `priority`; filters alone don’t help scan a long hub.
- One soft nest level (not recursive trees) matches “group then sort” and “nested soft groups” without a third control.
- Frequency stays task-only (standalone notes have no category).

## Non-goals

- Frequency / category on standalone notes
- Nested groups deeper than one soft level
- Changing NotesPanel (dashboard) beyond leaving it flat
- Server schema changes

## Model

```
Group by: none | project | priority   → primary soft sections
Sort:     updated | priority | project → order inside leaf
Nest:     when groupBy is project and sort is priority (or reverse),
          soft subgroup headers appear inside each primary section
```

Pinned stays first within each leaf. Collapse state persisted in localStorage per section key.

## Phases

0. Baseline + progress file
1. Pure `buildNoteSections` + collapse prefs + unit tests
2. NotesView UI (Group by control, sections, nest, CSS, copy)
3. Docs (README) + full validate

## Acceptance criteria

- AC1: Group by None keeps flat sorted list
- AC2: Group by Project shows soft project sections; collapse remembers
- AC3: Group by Priority shows soft priority sections (High→Low)
- AC4: Group Project + Sort Priority nests soft priority subgroups; Group Priority + Sort Project nests project subgroups
- AC5: Sort Updated within groups has no nested headers
- AC6: Empty / loading / error / filtered-empty unchanged and usable
- AC7: `npm test` + lint + build green; no schema change
