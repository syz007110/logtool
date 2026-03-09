<template>
  <div class="splash-screen" :class="{ 'is-leaving': leaving }" role="status" aria-live="polite" aria-label="App is loading">
    <div class="splash-center">
      <div ref="lottieRef" class="splash-lottie" v-show="lottieReady" />
      <img v-show="!lottieReady" class="splash-logo" :src="logoSrc" alt="LogTool" />
      <div class="splash-text">LogTool</div>
    </div>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import lottie from 'lottie-web'

export default {
  name: 'SplashScreen',
  props: {
    leaving: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    const lottieRef = ref(null)
    const lottieReady = ref(false)
    let lottieInstance = null

    const notifySplashComplete = () => {
      try {
        window.dispatchEvent(new Event('app:splash-complete'))
      } catch (_) {}
    }

    const base = process.env.BASE_URL || '/'
    const logoSrc = computed(() => `${base}Icons/logo.svg`)
    const lottiePath = computed(() => `${base}startLogoV2.json`)

    onMounted(() => {
      const safetyTimer = setTimeout(() => {
        notifySplashComplete()
      }, 2800)

      if (!lottieRef.value) {
        setTimeout(() => {
          clearTimeout(safetyTimer)
          notifySplashComplete()
        }, 900)
        return
      }

      try {
        lottieInstance = lottie.loadAnimation({
          container: lottieRef.value,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: lottiePath.value,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet'
          }
        })

        lottieInstance.addEventListener('complete', () => {
          clearTimeout(safetyTimer)
          notifySplashComplete()
        })
        lottieReady.value = true
      } catch (error) {
        console.warn('Splash lottie load failed, fallback to logo animation', error)
        lottieReady.value = false
        setTimeout(() => {
          clearTimeout(safetyTimer)
          notifySplashComplete()
        }, 900)
      }
    })

    onBeforeUnmount(() => {
      try {
        lottieInstance?.removeEventListener?.('complete', notifySplashComplete)
        lottieInstance?.destroy?.()
      } catch (_) {}
    })

    return { logoSrc, lottieRef, lottieReady }
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

.splash-lottie {
  width: 120px;
  height: 120px;
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
