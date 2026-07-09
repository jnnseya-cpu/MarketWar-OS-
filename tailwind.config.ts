import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07090f",
          900: "#0b0f19",
          850: "#101624",
          800: "#151d2e",
          700: "#1e2941",
          600: "#2b3a5c",
        },
        war: {
          DEFAULT: "#10b981",
          dim: "#0d9668",
        },
        alert: "#f43f5e",
        caution: "#f59e0b",
        intel: "#38bdf8",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
