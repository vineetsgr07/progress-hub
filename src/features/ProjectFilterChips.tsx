import { NOTES_PROJECT_ALL, notesListCopy } from './notes-list'
import { resolveTagSwatch } from './tags'
import { useTagColors } from './TagColorsContext'

type Props = {
  projects: string[]
  value: string
  onChange: (project: string) => void
  /** Optional compact styling for the side panel. */
  compact?: boolean
}

/** Horizontal All + project chips — click to filter notes. */
export function ProjectFilterChips({
  projects,
  value,
  onChange,
  compact,
}: Props) {
  const { colors } = useTagColors()
  const selected = value || NOTES_PROJECT_ALL

  return (
    <div
      className={`project-filter-chips${compact ? ' is-compact' : ''}`}
      role="group"
      aria-label={notesListCopy.filterProject}
    >
      <button
        type="button"
        className={`project-filter-chip${selected === NOTES_PROJECT_ALL ? ' is-active' : ''}`}
        aria-pressed={selected === NOTES_PROJECT_ALL}
        onClick={() => onChange(NOTES_PROJECT_ALL)}
      >
        {notesListCopy.sourceAll}
      </button>
      {projects.map((name) => {
        const swatch = resolveTagSwatch('project', name, colors)
        const active = selected === name
        return (
          <button
            type="button"
            key={name}
            className={`project-filter-chip${active ? ' is-active' : ''}`}
            aria-pressed={active}
            style={
              active
                ? {
                    background: swatch.bg,
                    color: swatch.fg,
                    borderColor: swatch.border,
                  }
                : undefined
            }
            onClick={() => onChange(name)}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}
