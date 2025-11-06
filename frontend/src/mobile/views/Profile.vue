<template>
  <div class="page">
    <van-nav-bar :title="$t('nav.profile')" fixed safe-area-inset-top />
    <div class="content">
      <van-cell :title="$t('account.title')" is-link :to="{ name: 'Account' }" />
      <van-cell :title="$t('nav.logout')" @click="onLogout" />
    </div>
  </div>
</template>

<script>
import { NavBar as VanNavBar, Cell as VanCell } from 'vant'
import { useStore } from 'vuex'

export default {
  name: 'MProfile',
  components: {
    'van-nav-bar': VanNavBar,
    'van-cell': VanCell
  },
  setup() {
    const store = useStore()
    const onLogout = () => {
      try { store.dispatch('auth/logout') } catch (_) {}
      window.location.href = '/m/login'
    }
    return { onLogout }
  }
}
</script>

<style scoped>
.page {
  padding-top: 46px;
  /* 底部留白由 App.vue 全局样式统一设置 */
}
.content {
  padding: 12px;
}
</style>


