import { Menu } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import type { TagSwatch } from './tags'

type Option = { value: string; label: string; swatch?: TagSwatch }

type Props = {
  value: string
  options: Array<string | Option>
  onSelect: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  /** Active chip colours from the Tags panel. */
  swatch?: TagSwatch
}

function toOption(item: string | Option): Option {
  return typeof item === 'string' ? { value: item, label: item } : item
}

/** Coloured tag chip with a full-label menu (no truncation). */
export function RowMeta({
  value,
  options,
  onSelect,
  ariaLabel,
  disabled,
  className,
  swatch,
}: Props) {
  const items = options.map(toOption)
  const label = items.find((item) => item.value === value)?.label ?? value
  const buttonClass = ['row-meta', className].filter(Boolean).join(' ')
  const style = swatch
    ? {
        background: swatch.bg,
        color: swatch.fg,
        borderColor: swatch.border,
      }
    : undefined

  return (
    <Menu
      withinPortal
      position="bottom-start"
      disabled={disabled}
      classNames={{ dropdown: 'row-meta-menu' }}
    >
      <Menu.Target>
        <button
          type="button"
          className={buttonClass}
          style={style}
          aria-label={ariaLabel}
          disabled={disabled}
          data-no-dnd
        >
          <span className="row-meta-label">{label}</span>
          <IconChevronDown size={12} stroke={1.5} className="row-meta-caret" aria-hidden />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((item) => {
          const itemSwatch = item.swatch
          return (
            <Menu.Item
              key={item.value}
              onClick={() => onSelect(item.value)}
              className={item.value === value ? 'row-meta-selected' : undefined}
              leftSection={
                itemSwatch ? (
                  <span
                    className="row-meta-menu-dot"
                    style={{ background: itemSwatch.bg, borderColor: itemSwatch.border }}
                    aria-hidden
                  />
                ) : undefined
              }
            >
              {item.label}
            </Menu.Item>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}
