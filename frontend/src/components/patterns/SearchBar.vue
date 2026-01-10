<template>
  <div class="search-bar">
    <BaseInput
      v-model="searchValue"
      :placeholder="placeholder"
      :clearable="clearable"
      @input="handleInput"
      @clear="handleClear"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </BaseInput>
  </div>
</template>

<script>
import { ref, watch } from 'vue'
import BaseInput from '../base/Input.vue'
import { Search } from '@element-plus/icons-vue'

export default {
  name: 'SearchBar',
  components: {
    BaseInput,
    Search
  },
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: '请输入搜索关键词'
    },
    clearable: {
      type: Boolean,
      default: true
    },
    debounce: {
      type: Number,
      default: 300
    }
  },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { emit }) {
    const searchValue = ref(props.modelValue)
    let debounceTimer = null

    watch(() => props.modelValue, (newVal) => {
      searchValue.value = newVal
    })

    const handleInput = (value) => {
      searchValue.value = value
      emit('update:modelValue', value)
      
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      
      debounceTimer = setTimeout(() => {
        emit('search', value)
      }, props.debounce)
    }

    const handleClear = () => {
      searchValue.value = ''
      emit('update:modelValue', '')
      emit('clear')
      emit('search', '')
    }

    return {
      searchValue,
      handleInput,
      handleClear
    }
  }
}
</script>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
}
</style>
