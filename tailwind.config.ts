import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        gold: "var(--gold)",
        pos: "var(--pos)",
        neg: "var(--neg)",
        warn: "var(--warn)",
        // Tinted fills. These composite over a known opaque ground, so they
        // stay alpha rather than flattening to a token (decision 32 flattens
        // SURFACE tints; semantic tints keep their alpha).
        "accent-dim": "var(--accent-dim)",
        "pos-dim": "var(--pos-dim)",
        "neg-dim": "var(--neg-dim)",
        "warn-dim": "var(--warn-dim)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        // Deliberately NOT aliased as `accent`: borderColor.accent would
        // override the colours-derived one and silently drop four existing
        // full-opacity `border-accent` usages to 30%.
        "accent-border": "var(--accent-border)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
