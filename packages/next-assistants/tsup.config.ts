import { defineConfig } from "tsup"

export default defineConfig(options => {
  return {
    entry: ["src/client/index.ts", "src/server/index.ts"],
    dts: true,
    watch: options.watch,
    sourcemap: true,
    minify: true,
    target: "es2020",
    format: ["cjs", "esm"],
    external: ["openai", "react", "react-dom", "next", "next/server"]
  }
})
