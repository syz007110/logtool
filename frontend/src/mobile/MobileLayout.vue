<template>
  <div class="mobile-layout" :class="{ 'no-tabbar': hideTabbar }">
    <router-view />
    <van-tabbar v-if="!hideTabbar" route fixed placeholder>
      <van-tabbar-item :to="{ name: 'MDevices' }">
        <template #icon="{ active }">
          <svg class="tabbar-custom-icon" width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5 35C5 33.8954 5.89543 33 7 33H41C42.1046 33 43 33.8954 43 35V42H5V35Z" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M42 18L34 18L28 12L34 6L42 6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8" cy="12" r="4" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4"/>
            <path d="M12 12L28 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 16L18 33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </template>
        {{ $t('mobile.tabs.devices') }}
      </van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MSmartSearch' }">
        <template #icon="{ active }">
          <svg class="tabbar-custom-icon" width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="9" y="18" width="30" height="24" rx="2" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4"/>
            <circle cx="17" cy="26" r="2" :fill="active ? 'white' : 'currentColor'"/>
            <circle cx="31" cy="26" r="2" :fill="active ? 'white' : 'currentColor'"/>
            <path d="M20 32C18.8954 32 18 32.8954 18 34C18 35.1046 18.8954 36 20 36V32ZM28 36C29.1046 36 30 35.1046 30 34C30 32.8954 29.1046 32 28 32V36ZM20 36H28V32H20V36Z" :fill="active ? 'white' : 'currentColor'"/>
            <path d="M24 10V18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 26V34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M44 26V34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="24" cy="8" r="2" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4"/>
          </svg>
        </template>
        {{ $t('mobile.tabs.smartQa') }}
      </van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MProfile' }">
        <template #icon="{ active }">
          <svg class="tabbar-custom-icon" width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="24" cy="12" r="8" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44" :fill="active ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </template>
        {{ $t('mobile.tabs.profile') }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant'
import 'vant/lib/index.css'

export default {
  name: 'MobileLayout',
  components: {
    'van-tabbar': VanTabbar,
    'van-tabbar-item': VanTabbarItem
  },
  setup() {
    const route = useRoute()
    const hideTabbar = computed(() => {
      return route.meta?.hideTabbar === true
    })
    return { hideTabbar }
  }
}
</script>

<style scoped>
.mobile-layout {
  padding-bottom: 0;
}

.mobile-layout.no-tabbar {
  padding-bottom: 0;
}

:deep(.van-tabbar) {
  border-top: 1px solid #ebedf0;
  background: #fff;
  height: 50px;
  padding-bottom: max(0px, env(safe-area-inset-bottom) - 8px);
  box-sizing: content-box;
  width: 100%;
  left: 0;
  transform: none;
}

:deep(.van-tabbar-item) {
  font-size: 12px;
  height: 100%;
}

:deep(.van-tabbar-item--active) {
  color: var(--m-color-brand);
}

:deep(.van-tabbar-item__icon) {
  font-size: 24px;
  margin-bottom: 4px;
}

.tabbar-custom-icon {
  width: 24px;
  height: 24px;
  display: block;
}

/* iOS 添加到主屏幕后（standalone）safe-area 往往更大，单独收紧 tabbar 高度 */
@media (display-mode: standalone) {
  :deep(.van-tabbar) {
    padding-bottom: max(0px, env(safe-area-inset-bottom) - 22px);
  }
}
</style>

