/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "surface-container-lowest": "#ffffff", 
        "surface-container": "#e5eeff", 
        "unread-coral": "#F43F5E",
        "surface-container-low": "#eff4ff",
        "background": "#f8f9ff", 
        "primary-container": "#004ac6", 
        "on-surface": "#0b1c30",
        "surface-variant": "#d3e3ff", 
        "primary": "#003594", 
        "sidebar-bg": "#1E293B",
        "on-primary": "#ffffff",
        "mention-gold": "#FEF3C7",
        "border-subtle": "#E2E8F0"
      },
      borderRadius: { 
        "bubble-incoming": "16px 16px 16px 4px", 
        "bubble-outgoing": "16px 16px 4px 16px" 
      },
    },
  },
  plugins: [],
}