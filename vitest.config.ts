import { defineConfig } from "vitest/config";

// 시험은 tests/ 폴더에 두고 `npm test`로 한 번에 실행한다.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
