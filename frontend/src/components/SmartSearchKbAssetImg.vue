<template>
  <div class="ss-kb-asset-wrap">
    <img
      v-if="imageSrc && !loadFailed"
      :key="imageSrc"
      :src="imageSrc"
      class="ss-kb-asset-img"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @load="onImgLoad"
      @error="onImgError"
    />
    <span v-else-if="showFailed" class="ss-kb-asset-fail">图片加载失败</span>
  </div>
</template>

<script>
import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'

export default {
  name: 'SmartSearchKbAssetImg',
  props: {
    fileId: { type: Number, required: true },
    assetId: { type: Number, required: true }
  },
  setup (props) {
    const store = useStore()
    const loadFailed = ref(false)

    const imageSrc = computed(() => {
      const fid = Number(props.fileId)
      const aid = Number(props.assetId)
      if (!Number.isFinite(fid) || fid <= 0 || !Number.isFinite(aid) || aid <= 0) return ''
      const token = String(store.state.auth?.token || '').trim()
      if (!token) return ''
      const q = new URLSearchParams()
      q.set('token', token)
      return `/api/smart-search/mknowledge-assets/${fid}/${aid}?${q.toString()}`
    })

    const showFailed = computed(() => {
      if (!Number.isFinite(Number(props.fileId)) || Number(props.fileId) <= 0) return true
      if (!Number.isFinite(Number(props.assetId)) || Number(props.assetId) <= 0) return true
      if (!String(store.state.auth?.token || '').trim()) return true
      return loadFailed.value
    })

    function onImgLoad () {
      loadFailed.value = false
    }

    function onImgError () {
      loadFailed.value = true
    }

    watch(imageSrc, () => {
      loadFailed.value = false
    })

    return { imageSrc, loadFailed, showFailed, onImgLoad, onImgError }
  }
}
</script>

<style scoped>
.ss-kb-asset-wrap {
  margin-top: 8px;
}

.ss-kb-asset-img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter, #e5e7eb);
}

.ss-kb-asset-fail {
  font-size: 12px;
  color: var(--el-color-warning);
}
</style>
