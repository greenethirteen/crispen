import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Press-check palette
        paper: "#FFFFFF", // white ground (matches landing theme)
        ink: "#17161A", // near-black ink
        registration: "#E8412C", // registration red
        proof: "#00AEEF", // proof cyan
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        spec: "0 1px 0 0 #17161A, 4px 5px 0 0 #17161A",
      },
    },
  },
  plugins: [],
};

export default config;
