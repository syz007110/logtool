<template>
    <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span>0h</span>
        <span>1.5h</span>
        <span>3h</span>
      </div>
      <el-progress
        :percentage="percentage"
        :stroke-width="20"
        status="success"
        color="#409EFF"
      />
      <div style="text-align: right; font-size: 12px; color: #666;">
        当前已进行：{{ elapsedTime }} 分钟
      </div>
    </div>
  </template>
  
  <script setup>
const estimatedHours = 3 // 手术预计时长 3 小时
const elapsedTime = 75   // 当前已进行 75 分钟
const percentage = (elapsedTime / (estimatedHours * 60)) * 100
</script>
