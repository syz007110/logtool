<template>
  <div class="splash-screen" :class="{ 'is-leaving': leaving }" role="status" aria-live="polite" aria-label="App is loading">
    <div class="splash-center">
      <img class="splash-logo" :src="logoSrc" alt="LogTool" />
      <div class="splash-text">LogTool</div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'SplashScreen',
  props: {
    leaving: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    const logoSrc = computed(() => `${process.env.BASE_URL || '/'}Icons/logo.svg`)
    return { logoSrc }
  }
}
</script>

<style scoped>
.splash-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  opacity: 1;
  transition: opacity 240ms ease;
}

.splash-screen.is-leaving {
  opacity: 0;
}

.splash-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.splash-logo {
  width: 84px;
  height: 84px;
  animation: logo-pop 900ms ease both;
  transform-origin: center;
}

.splash-text {
  color: #032b71;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.4px;
  opacity: 0.9;
}

@keyframes logo-pop {
  0% { transform: scale(0.88); opacity: 0; }
  40% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .splash-logo {
    animation: none;
  }

  .splash-screen {
    transition: none;
  }
}
</style>
