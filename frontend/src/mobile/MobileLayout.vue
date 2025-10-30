<template>
  <div class="mobile-layout">
    <router-view />
    <van-tabbar route fixed>
      <van-tabbar-item :to="{ name: 'MError' }" icon="search">{{ $t('mobile.tabs.error') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MLogs' }" icon="notes-o">{{ $t('mobile.tabs.logs') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MSurgeries' }" icon="orders-o">{{ $t('mobile.tabs.surgeries') }}</van-tabbar-item>
      <van-tabbar-item :to="{ name: 'MProfile' }" icon="user-o">{{ $t('mobile.tabs.profile') }}</van-tabbar-item>
    </van-tabbar>
  </div>
  
</template>

<script>
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant'
import 'vant/lib/index.css'

export default {
  name: 'MobileLayout',
  components: {
    'van-tabbar': VanTabbar,
    'van-tabbar-item': VanTabbarItem
  }
}
</script>

<style scoped>
.mobile-layout {
  padding-bottom: 50px;
}
</style>


