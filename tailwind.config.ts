import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        page: "var(--page)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-muted": "var(--ink-muted)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        good: "var(--status-good)",
        critical: "var(--status-critical)",
        accent: "var(--accent)",
        "accent-text": "var(--accent-text)",
        "brand-dark": "var(--brand-dark)",
        "brand-cream": "var(--brand-cream)",
        "brand-light": "var(--brand-light)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        heading: ["var(--font-heading)"],
      },
    },
  },
  plugins: [],
};

export default config;
