/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "background": "#0f141b", "on-surface": "#dee2ec", "on-tertiary-fixed": "#23005c",
        "on-secondary": "#00390d", "error-container": "#93000a", "tertiary-container": "#a078ff",
        "on-primary-fixed-variant": "#004492", "on-primary-fixed": "#001a40", "inverse-primary": "#005bbf",
        "secondary-container": "#27a640", "outline-variant": "#414754", "tertiary": "#d0bcff",
        "on-secondary-fixed-variant": "#005317", "secondary-fixed-dim": "#67df70", "on-tertiary-container": "#340080",
        "primary": "#acc7ff", "inverse-on-surface": "#2c3138", "on-tertiary-fixed-variant": "#5516be",
        "tertiary-fixed": "#e9ddff", "surface-container-highest": "#30353d", "surface-container-low": "#171c23",
        "on-secondary-container": "#00320a", "on-error": "#690005", "primary-fixed": "#d7e2ff",
        "secondary-fixed": "#83fc89", "surface-tint": "#acc7ff", "surface-variant": "#30353d",
        "surface-container-high": "#252a32", "surface": "#0f141b", "inverse-surface": "#dee2ec",
        "surface-container-lowest": "#090f15", "on-primary-container": "#00285b", "surface-container": "#1b2027",
        "on-secondary-fixed": "#002105", "primary-container": "#498fff", "on-background": "#dee2ec",
        "surface-bright": "#343941", "secondary": "#67df70", "surface-dim": "#0f141b",
        "tertiary-fixed-dim": "#d0bcff", "on-primary": "#002f68", "on-tertiary": "#3c0091",
        "error": "#ffb4ab", "primary-fixed-dim": "#acc7ff", "outline": "#8b909f",
        "on-error-container": "#ffdad6", "on-surface-variant": "#c1c6d6"
      },
      spacing: {
        "lg": "24px", "md": "16px", "xl": "40px", "sm": "8px", "xs": "4px"
      }
    }
  },
  plugins: [],
}