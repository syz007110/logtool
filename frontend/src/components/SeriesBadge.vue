<template>
  <span class="series-badge" :class="themeClass">
    {{ displayCode }}
  </span>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'SeriesBadge',
  props: {
    series: {
      type: Object,
      default: null
    }
  },
  setup (props) {
    const displayCode = computed(() => {
      return String(props.series?.series_code || '').trim().toUpperCase() || '--'
    })

    const themeClass = computed(() => {
      if (displayCode.value === 'SR') return 'series-badge--sr'
      if (displayCode.value === 'SA') return 'series-badge--sa'
      return 'series-badge--default'
    })

    return {
      displayCode,
      themeClass
    }
  }
}
</script>

<style scoped>
.series-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  color: var(--black-white-white);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.3px;
  box-shadow: var(--card-shadow);
}

.series-badge--sr {
  background: linear-gradient(135deg, var(--blue-700) 0%, var(--blue-600) 100%);
}

.series-badge--sa {
  background: linear-gradient(135deg, var(--red-700) 0%, var(--red-600) 100%);
}

.series-badge--default {
  background: linear-gradient(135deg, var(--slate-700) 0%, var(--slate-600) 100%);
}
</style>
