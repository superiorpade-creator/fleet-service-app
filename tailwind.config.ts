import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14181F",      // near-black navy — nav, headers, primary text
        steel: "#3E4C59",    // slate — secondary text, borders
        paper: "#F7F7F5",    // off-white — page background, legible in sun
        safety: "#FF6A13",   // safety orange — primary actions, in-progress
        go: "#1F8A57",       // green — serviced / completed
        alert: "#D64545",    // red — not serviced / destructive
        line: "#E3E1DB",     // hairline borders on paper
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        lg: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
