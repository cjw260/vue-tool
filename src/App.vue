<script setup lang="ts"></script>

<template>
  <router-view />
</template>

<style>
:root {
  --app-bg: #edf1ea;
  --app-bg-soft: rgba(255, 255, 255, 0.72);
  --app-panel: rgba(255, 255, 255, 0.88);
  --app-panel-strong: #ffffff;
  --app-panel-muted: #f5f7f2;
  --app-line: rgba(46, 58, 47, 0.12);
  --app-line-strong: rgba(46, 58, 47, 0.18);
  --app-text: #203128;
  --app-text-soft: #5d6d63;
  --app-text-faint: #7f8d84;
  --app-primary: #1e6d5a;
  --app-primary-strong: #154c3f;
  --app-primary-soft: rgba(30, 109, 90, 0.12);
  --app-accent: #be7b31;
  --app-danger: #bc4c3a;
  --app-danger-soft: rgba(188, 76, 58, 0.12);
  --app-shadow-sm: 0 10px 24px rgba(36, 48, 40, 0.08);
  --app-shadow-md: 0 18px 40px rgba(31, 44, 35, 0.12);
  --app-shadow-lg: 0 28px 60px rgba(24, 35, 28, 0.18);
  --app-radius-sm: 12px;
  --app-radius-md: 18px;
  --app-radius-lg: 28px;
  --app-transition: 180ms ease;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
}

html {
  color-scheme: light;
}

body {
  margin: 0;
  color: var(--app-text);
  background:
    radial-gradient(circle at top left, rgba(190, 123, 49, 0.16), transparent 28%),
    radial-gradient(circle at top right, rgba(30, 109, 90, 0.14), transparent 24%),
    linear-gradient(180deg, #f5f7f1 0%, #edf1ea 44%, #e6ebe4 100%);
  font:
    500 14px/1.5 "Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  letter-spacing: 0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.45;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.18) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.4), transparent 85%);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}

button {
  border: 0;
  background: none;
}

a {
  color: inherit;
  text-decoration: none;
}
</style>
