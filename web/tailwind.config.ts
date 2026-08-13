import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07111f",
        accent: "#7cf7d4",
        highlight: "#66a3ff",
      },
      boxShadow: {
        glow: "0 24px 80px rgba(0, 0, 0, 0.42)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Trebuchet MS", "sans-serif"],
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;