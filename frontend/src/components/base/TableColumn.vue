<template>
  <el-table-column
    :prop="prop"
    :label="label"
    :width="width"
    :min-width="minWidth"
    :fixed="fixed"
    :sortable="sortable"
    :align="align"
    :header-align="headerAlign"
    :show-overflow-tooltip="showOverflowTooltip"
    :class-name="className"
  >
    <template v-if="$slots.default" #default="scope">
      <slot :row="scope.row" :column="scope.column" :$index="scope.$index"></slot>
    </template>
    <template v-if="$slots.header" #header="scope">
      <slot name="header" :column="scope.column" :$index="scope.$index"></slot>
    </template>
  </el-table-column>
</template>

<script>
export default {
  name: 'BaseTableColumn',
  props: {
    prop: {
      type: String,
      default: ''
    },
    label: {
      type: String,
      default: ''
    },
    width: {
      type: [String, Number],
      default: undefined
    },
    minWidth: {
      type: [String, Number],
      default: undefined
    },
    fixed: {
      type: [Boolean, String],
      default: false,
      validator: (value) => [true, false, 'left', 'right'].includes(value)
    },
    sortable: {
      type: [Boolean, String],
      default: false,
      validator: (value) => [true, false, 'custom'].includes(value)
    },
    align: {
      type: String,
      default: 'left',
      validator: (value) => ['left', 'center', 'right'].includes(value)
    },
    headerAlign: {
      type: String,
      default: undefined,
      validator: (value) => value === undefined || ['left', 'center', 'right'].includes(value)
    },
    showOverflowTooltip: {
      type: Boolean,
      default: false
    },
    className: {
      type: String,
      default: ''
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
