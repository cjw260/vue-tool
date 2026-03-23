<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="brand-block">
        <div class="brand-mark">VT</div>
        <div class="brand-copy">
          <span class="brand-kicker">Collaborative sheet workspace</span>
          <strong class="brand-title">在线协同表格工作台</strong>
        </div>
      </div>

      <div class="header-meta">
        <div class="meta-chip">
          <span class="meta-dot"></span>
          <span>实时协作</span>
        </div>
        <div class="meta-copy">
          <span class="meta-label">模块</span>
          <span class="meta-value">协同表格</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="app-main-shell">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
}

.app-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 28px 18px;
  backdrop-filter: blur(18px);
}

.app-header::after {
  content: '';
  position: absolute;
  right: 28px;
  bottom: 0;
  left: 28px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(46, 58, 47, 0.12) 12%,
    rgba(46, 58, 47, 0.08) 88%,
    transparent
  );
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid rgba(30, 109, 90, 0.22);
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(245, 247, 242, 0.9)),
    linear-gradient(145deg, rgba(30, 109, 90, 0.16), rgba(190, 123, 49, 0.12));
  box-shadow: var(--app-shadow-sm);
  color: var(--app-primary-strong);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-kicker {
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.header-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.meta-chip,
.meta-copy {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  background: var(--app-bg-soft);
  box-shadow: var(--app-shadow-sm);
  white-space: nowrap;
}

.meta-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-primary);
  box-shadow: 0 0 0 6px rgba(30, 109, 90, 0.12);
}

.meta-label {
  color: var(--app-text-faint);
  font-size: 12px;
}

.meta-value {
  font-weight: 700;
}

.app-main {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 0 22px 22px;
}

.app-main-shell {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: var(--app-radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(246, 248, 243, 0.88));
  box-shadow: var(--app-shadow-md);
  overflow: hidden;
}

@media (max-width: 960px) {
  .app-header {
    padding: 18px 20px 16px;
  }

  .app-header::after {
    right: 20px;
    left: 20px;
  }

  .brand-title {
    font-size: 20px;
  }

  .header-meta {
    gap: 8px;
  }

  .meta-copy {
    display: none;
  }

  .app-main {
    padding: 0 16px 16px;
  }
}

@media (max-width: 720px) {
  .app-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-meta {
    width: 100%;
    justify-content: space-between;
  }

  .brand-kicker {
    letter-spacing: 0.12em;
  }
}
</style>
