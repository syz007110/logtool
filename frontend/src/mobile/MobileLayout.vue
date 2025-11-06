<template>
  <div class="mobile-layout" :class="{ 'no-tabbar': hideTabbar }">
    <router-view />
    <van-tabbar v-if="!hideTabbar" route fixed placeholder safe-area-inset-bottom>
      <van-tabbar-item :to="{ name: 'MError' }" icon="search">{{ $t('mobile.tabs.error') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MLogs' }" icon="notes-o">{{ $t('mobile.tabs.logs') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MSurgeries' }" icon="orders-o">{{ $t('mobile.tabs.surgeries') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MProfile' }" icon="user-o">{{ $t('mobile.tabs.profile') }}</van-tabbar-item>
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
  padding-bottom: 65px;
}

.mobile-layout.no-tabbar {
  padding-bottom: 0;
}

:deep(.van-tabbar) {
  border-top: 1px solid #ebedf0;
  background: #fff;
}

:deep(.van-tabbar-item) {
  font-size: 12px;
}

:deep(.van-tabbar-item--active) {
  color: #2b7fff;
}

:deep(.van-tabbar-item__icon) {
  font-size: 24px;
  margin-bottom: 4px;
}
</style>


