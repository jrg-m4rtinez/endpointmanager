const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20000,
  },
})
