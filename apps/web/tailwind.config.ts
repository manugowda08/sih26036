import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        saffron: "#FF9933",
        indiaGreen: "#138808",
        navy: "#0B3C6F",
        ink: "#12263A",
      },
      fontFamily: {
        sans: ["Segoe UI", "Noto Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
