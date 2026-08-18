import { createTheme } from '@mantine/core'

/** Quiet minimal theme for Progress Hub */
export const theme = createTheme({
  primaryColor: 'gray',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily:
    '"SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif',
  headings: {
    fontFamily:
      '"SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    fontWeight: '600',
  },
  colors: {
    gray: [
      '#f8f9fb',
      '#f1f3f6',
      '#e4e8ee',
      '#cfd6e0',
      '#a8b3c2',
      '#7a8799',
      '#5c6b7e',
      '#3d4a5c',
      '#252d3a',
      '#152033',
    ],
  },
  spacing: {
    xs: '6px',
    sm: '10px',
    md: '14px',
    lg: '20px',
    xl: '28px',
  },
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    Select: {
      defaultProps: {
        size: 'xs',
        checkIconPosition: 'right',
        allowDeselect: false,
      },
    },
    TextInput: {
      defaultProps: {
        size: 'sm',
      },
    },
    Textarea: {
      defaultProps: {
        size: 'sm',
      },
    },
    ActionIcon: {
      defaultProps: {
        variant: 'subtle',
        color: 'gray',
        size: 'sm',
      },
    },
    Modal: {
      defaultProps: {
        centered: true,
        radius: 'md',
        overlayProps: { backgroundOpacity: 0.35, blur: 2 },
      },
    },
    Checkbox: {
      defaultProps: {
        size: 'sm',
        color: 'gray',
      },
    },
  },
})
