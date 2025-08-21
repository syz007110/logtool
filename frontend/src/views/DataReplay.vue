<template>
  <div class="data-replay">
    <!-- 控制面板 -->
    <el-card class="control-panel">
      <div class="control-row">
        <div class="upload-section">
          <el-upload
            action=""
            :http-request="handleUploadRequest"
            :show-file-list="false"
            accept=".bin"
          >
            <el-button type="primary" icon="Upload">上传二进制文件(.bin)</el-button>
          </el-upload>
          <el-button :disabled="!fileId" @click="downloadCsv" plain icon="Download">下载CSV</el-button>
        </div>
        
        <div class="file-info" v-if="fileName">
          <span class="info-item">文件: {{ fileName }}</span>
          <span class="info-item">大小: {{ prettySize(fileSize) }}</span>
          <span class="info-item">总条数: {{ totalEntries }}</span>
        </div>
      </div>
    </el-card>

    <!-- 图表区域 -->
    <div class="charts-section" v-if="fileId">
      <div class="charts-row">
        <!-- 左手关节位置图表 -->
        <div class="chart-card left-chart">
          <div class="chart-header">
            <h3>左手关节位置</h3>
            <div class="chart-controls">
              <el-button size="small" @click="resetZoom('left')" icon="Refresh">重置缩放</el-button>
            </div>
          </div>
          <div ref="leftHandChart" class="chart-container"></div>
        </div>
        
        <!-- 右手关节位置图表 -->
        <div class="chart-card right-chart">
          <div class="chart-header">
            <h3>右手关节位置</h3>
            <div class="chart-controls">
              <el-button size="small" @click="resetZoom('right')" icon="Refresh">重置缩放</el-button>
            </div>
          </div>
          <div ref="rightHandChart" class="chart-container"></div>
        </div>
      </div>
    </div>

    <!-- 3D机械臂视图 -->
    <div class="three-section" v-if="fileId">
      <div class="chart-card three-chart">
        <div class="chart-header">
          <h3>机械臂3D视图</h3>
          <div class="three-controls">
            <el-button size="small" @click="resetThreeView" icon="Refresh">重置视角</el-button>
            <el-button size="small" @click="toggleThreeRotation" :type="threeRotationEnabled ? 'primary' : ''" icon="VideoPlay">
              {{ threeRotationEnabled ? '停止旋转' : '开始旋转' }}
            </el-button>
          </div>
        </div>
        <div ref="threeContainer" class="three-container">
          <div class="three-placeholder" v-if="!threeInitialized">
            <p>3D机械臂渲染区域</p>
            <p>待Three.js数据输入</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据播放控制 -->
    <div class="playback-controls" v-if="fileId && totalEntries > 0">
      <el-card class="control-panel">
        <div class="playback-row">
          <div class="playback-buttons">
            <el-button @click="playData" :disabled="isPlaying" icon="VideoPlay" type="primary">
              播放
            </el-button>
            <el-button @click="pauseData" :disabled="!isPlaying" icon="VideoPause">
              暂停
            </el-button>
            <el-button @click="stopData" icon="VideoStop">
              停止
            </el-button>
          </div>
          
          <div class="playback-info">
            <span>当前帧: {{ currentFrame }}/{{ totalEntries }}</span>
            <span>播放速度: {{ playbackSpeed }}x</span>
          </div>
          
          <div class="speed-control">
            <el-select v-model="playbackSpeed" size="small" style="width: 100px">
              <el-option label="0.5x" :value="0.5" />
              <el-option label="1x" :value="1" />
              <el-option label="2x" :value="2" />
              <el-option label="5x" :value="5" />
              <el-option label="10x" :value="10" />
            </el-select>
          </div>
        </div>
        
        <div class="timeline-row">
          <el-slider
            v-model="currentFrame"
            :min="1"
            :max="totalEntries"
            :step="1"
            show-stops
            show-input
            @change="seekToFrame"
            class="timeline-slider"
          />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import * as THREE from 'three'
import api from '../api'

export default {
  name: 'DataReplay',
  setup() {
    const fileId = ref('')
    const fileName = ref('')
    const fileSize = ref(0)
    const totalEntries = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(500)
    const rows = ref([])
    const columns = ref([])

    // 图表引用
    const leftHandChart = ref(null)
    const rightHandChart = ref(null)
    const threeContainer = ref(null)
    
    // 图表实例
    let leftChartInstance = null
    let rightChartInstance = null
    let threeScene = null
    let threeRenderer = null
    let threeCamera = null
    let threeInitialized = ref(false)
    let threeRotationEnabled = ref(false)
    let threeRotationId = null

    // 播放控制
    const isPlaying = ref(false)
    const currentFrame = ref(1)
    const playbackSpeed = ref(1)
    let playbackInterval = null

    const prettySize = (size) => {
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
      return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
    }

    // 初始化左手关节位置图表
    const initLeftHandChart = () => {
      if (!leftHandChart.value) {
        console.warn('左手图表容器不存在')
        return
      }
      
      console.log('初始化左手图表')
      leftChartInstance = echarts.init(leftHandChart.value)
      const option = {
        title: {
          text: '左手关节位置',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: '#6a7985'
            }
          }
        },
        legend: {
          data: ['关节1', '关节2', '关节3', '关节4', '关节5', '关节6', '关节7'],
          top: 35,
          textStyle: {
            fontSize: 12
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '20%',
          containLabel: true
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100
          },
          {
            type: 'slider',
            start: 0,
            end: 100
          }
        ],
        xAxis: {
          type: 'value',
          name: '时间 (s)',
          nameTextStyle: {
            color: '#666',
            fontSize: 12
          },
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          axisLabel: {
            color: '#666',
            fontSize: 11,
            formatter: function(value) {
              return (value / 1000).toFixed(1) + 's'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#eee'
            }
          },
          min: 'dataMin',
          max: 'dataMax'
        },
        yAxis: {
          type: 'value',
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          axisLabel: {
            color: '#666',
            fontSize: 11
          },
          splitLine: {
            lineStyle: {
              color: '#eee'
            }
          }
        },
        series: [
          { 
            name: '关节1', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#5470c6' },
            itemStyle: { color: '#5470c6' }
          },
          { 
            name: '关节2', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#91cc75' },
            itemStyle: { color: '#91cc75' }
          },
          { 
            name: '关节3', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#fac858' },
            itemStyle: { color: '#fac858' }
          },
          { 
            name: '关节4', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#ee6666' },
            itemStyle: { color: '#ee6666' }
          },
          { 
            name: '关节5', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#73c0de' },
            itemStyle: { color: '#73c0de' }
          },
          { 
            name: '关节6', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#3ba272' },
            itemStyle: { color: '#3ba272' }
          },
          { 
            name: '关节7', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#fc8452' },
            itemStyle: { color: '#fc8452' }
          }
        ]
      }
      leftChartInstance.setOption(option)
    }

    // 初始化右手关节位置图表
    const initRightHandChart = () => {
      if (!rightHandChart.value) {
        console.warn('右手图表容器不存在')
        return
      }
      
      console.log('初始化右手图表')
      rightChartInstance = echarts.init(rightHandChart.value)
      const option = {
        title: {
          text: '右手关节位置',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: '#6a7985'
            }
          }
        },
        legend: {
          data: ['关节1', '关节2', '关节3', '关节4', '关节5', '关节6', '关节7'],
          top: 35,
          textStyle: {
            fontSize: 12
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '20%',
          containLabel: true
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100
          },
          {
            type: 'slider',
            start: 0,
            end: 100
          }
        ],
        xAxis: {
          type: 'value',
          name: '时间 (s)',
          nameTextStyle: {
            color: '#666',
            fontSize: 12
          },
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          axisLabel: {
            color: '#666',
            fontSize: 11,
            formatter: function(value) {
              return (value / 1000).toFixed(1) + 's'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#eee'
            }
          },
          min: 'dataMin',
          max: 'dataMax'
        },
        yAxis: {
          type: 'value',
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          axisLabel: {
            color: '#666',
            fontSize: 11
          },
          splitLine: {
            lineStyle: {
              color: '#eee'
            }
          }
        },
        series: [
          { 
            name: '关节1', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#5470c6' },
            itemStyle: { color: '#5470c6' }
          },
          { 
            name: '关节2', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#91cc75' },
            itemStyle: { color: '#91cc75' }
          },
          { 
            name: '关节3', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#fac858' },
            itemStyle: { color: '#fac858' }
          },
          { 
            name: '关节4', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#ee6666' },
            itemStyle: { color: '#ee6666' }
          },
          { 
            name: '关节5', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#73c0de' },
            itemStyle: { color: '#73c0de' }
          },
          { 
            name: '关节6', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#3ba272' },
            itemStyle: { color: '#3ba272' }
          },
          { 
            name: '关节7', 
            type: 'line', 
            data: [], 
            smooth: true,
            lineStyle: { width: 2, color: '#fc8452' },
            itemStyle: { color: '#fc8452' }
          }
        ]
      }
      rightChartInstance.setOption(option)
    }

    // 初始化Three.js场景
    const initThreeScene = () => {
      if (!threeContainer.value) return
      
      // 创建场景
      threeScene = new THREE.Scene()
      threeScene.background = new THREE.Color(0xf0f0f0)
      
      // 创建相机
      threeCamera = new THREE.PerspectiveCamera(
        75,
        threeContainer.value.clientWidth / threeContainer.value.clientHeight,
        0.1,
        1000
      )
      threeCamera.position.set(0, 0, 5)
      
      // 创建渲染器
      threeRenderer = new THREE.WebGLRenderer({ antialias: true })
      threeRenderer.setSize(threeContainer.value.clientWidth, threeContainer.value.clientHeight)
      
      // 清空容器并添加渲染器
      threeContainer.value.innerHTML = ''
      threeContainer.value.appendChild(threeRenderer.domElement)
      
      // 添加光源
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
      threeScene.add(ambientLight)
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(10, 10, 5)
      threeScene.add(directionalLight)
      
      // 添加坐标轴辅助
      const axesHelper = new THREE.AxesHelper(2)
      threeScene.add(axesHelper)
      
      // 渲染场景
      threeRenderer.render(threeScene, threeCamera)
      threeInitialized.value = true
    }

    // 更新图表数据
    const updateCharts = () => {
      if (!rows.value.length) return
      
      console.log('更新图表数据，数据行数:', rows.value.length)
      console.log('第一行数据示例:', rows.value[0])
      
             // 计算时间数据（基于时间戳，单位100ns）
       const timeData = []
       const baseTimestamp = rows.value[0]?.ulint_data || 0
       
       for (let i = 0; i < rows.value.length; i++) {
         const timestamp = rows.value[i]?.ulint_data || 0
         const timeDiff = (timestamp - baseTimestamp) / 10000000 // 转换为毫秒 (100ns -> ms)
         timeData.push(timeDiff)
       }
      
      // 左手关节数据 (对应real_data_0到real_data_6)
      const leftHandData = []
      for (let i = 0; i < 7; i++) {
        const jointData = rows.value.map(row => {
          const fieldName = `real_data_${i}` // real_data_0 到 real_data_6
          return row[fieldName] || 0
        })
        leftHandData.push(jointData)
      }
      
      // 右手关节数据 (对应real_data_7到real_data_13)
      const rightHandData = []
      for (let i = 0; i < 7; i++) {
        const jointData = rows.value.map(row => {
          const fieldName = `real_data_${i + 7}` // real_data_7 到 real_data_13
          return row[fieldName] || 0
        })
        rightHandData.push(jointData)
      }
      
      console.log('时间数据:', timeData.slice(0, 10))
      console.log('左手关节数据:', leftHandData.map((data, i) => `关节${i+1}: ${data.slice(0, 5)}...`))
      console.log('右手关节数据:', rightHandData.map((data, i) => `关节${i+1}: ${data.slice(0, 5)}...`))
      
      // 更新左手图表
      if (leftChartInstance) {
        const leftOption = leftChartInstance.getOption()
        leftOption.series.forEach((series, index) => {
          // 将时间和数据组合成坐标点
          series.data = timeData.map((time, i) => [time, leftHandData[index][i] || 0])
        })
        leftChartInstance.setOption(leftOption)
      }
      
      // 更新右手图表
      if (rightChartInstance) {
        const rightOption = rightChartInstance.getOption()
        rightOption.series.forEach((series, index) => {
          // 将时间和数据组合成坐标点
          series.data = timeData.map((time, i) => [time, rightHandData[index][i] || 0])
        })
        rightChartInstance.setOption(rightOption)
      }
    }

    // 重置图表缩放
    const resetZoom = (chartType) => {
      if (chartType === 'left' && leftChartInstance) {
        leftChartInstance.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100
        })
      } else if (chartType === 'right' && rightChartInstance) {
        rightChartInstance.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100
        })
      }
    }

    // 重置3D视角
    const resetThreeView = () => {
      if (threeCamera) {
        threeCamera.position.set(0, 0, 5)
        threeCamera.lookAt(0, 0, 0)
        threeRenderer.render(threeScene, threeCamera)
      }
    }

    // 切换3D旋转
    const toggleThreeRotation = () => {
      threeRotationEnabled.value = !threeRotationEnabled.value
      if (threeRotationEnabled.value) {
        const animate = () => {
          if (threeRotationEnabled.value && threeScene) {
            threeScene.rotation.y += 0.01
            threeRenderer.render(threeScene, threeCamera)
            threeRotationId = requestAnimationFrame(animate)
          }
        }
        animate()
      } else {
        if (threeRotationId) {
          cancelAnimationFrame(threeRotationId)
          threeRotationId = null
        }
      }
    }

    // 播放控制函数
    const playData = () => {
      if (isPlaying.value) return
      isPlaying.value = true
      
      playbackInterval = setInterval(() => {
        if (currentFrame.value >= totalEntries.value) {
          stopData()
          return
        }
        currentFrame.value++
        seekToFrame(currentFrame.value)
      }, 1000 / playbackSpeed.value)
    }

    const pauseData = () => {
      isPlaying.value = false
      if (playbackInterval) {
        clearInterval(playbackInterval)
        playbackInterval = null
      }
    }

    const stopData = () => {
      isPlaying.value = false
      currentFrame.value = 1
      if (playbackInterval) {
        clearInterval(playbackInterval)
        playbackInterval = null
      }
      seekToFrame(1)
    }

    const seekToFrame = (frame) => {
      currentFrame.value = frame
      // 这里可以更新3D视图到对应帧的数据
      // TODO: 实现3D视图的数据更新
    }

    // 监听fileId变化，初始化图表
    watch(fileId, (newFileId) => {
      if (newFileId) {
        nextTick(() => {
          console.log('文件ID变化，初始化图表')
          initLeftHandChart()
          initRightHandChart()
          initThreeScene()
        })
      }
    })

    // 监听数据变化
    watch(rows, () => {
      nextTick(() => {
        try {
          updateCharts()
        } catch (error) {
          console.error('更新图表失败:', error)
        }
      })
    })

    // 监听播放速度变化
    watch(playbackSpeed, () => {
      if (isPlaying.value) {
        pauseData()
        playData()
      }
    })

    // 监听窗口大小变化
    const handleResize = () => {
      if (leftChartInstance) {
        leftChartInstance.resize()
      }
      if (rightChartInstance) {
        rightChartInstance.resize()
      }
      if (threeRenderer && threeContainer.value) {
        threeRenderer.setSize(threeContainer.value.clientWidth, threeContainer.value.clientHeight)
        threeCamera.aspect = threeContainer.value.clientWidth / threeContainer.value.clientHeight
        threeCamera.updateProjectionMatrix()
        threeRenderer.render(threeScene, threeCamera)
      }
    }

    const handleUploadRequest = async ({ file, onSuccess, onError }) => {
      try {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.motionData.upload(form)
        fileId.value = data.id
        fileName.value = data.filename
        fileSize.value = data.size
        currentPage.value = 1
        await fetchPreview(1)
        if (onSuccess) onSuccess(data)
      } catch (err) {
        ElMessage.error('上传失败')
        if (onError) onError(err)
      }
    }

    const fetchConfig = async () => {
      const { data } = await api.motionData.getConfig()
      columns.value = data.columns
    }

    const columnsToShow = ref([])
    watch(columns, () => {
      const wanted = [
        'ulint_data',
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 7}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 42}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 49}`),
        'real_data_18','real_data_19','real_data_20',
        'real_data_25','real_data_26','real_data_27',
      ]
      columnsToShow.value = columns.value.filter(c => wanted.includes(c.index))
    })

    const fetchPreview = async (page = currentPage.value) => {
      if (!fileId.value) return
      const offset = (page - 1) * pageSize.value
      const { data } = await api.motionData.preview(fileId.value, { offset, limit: pageSize.value })
      rows.value = data.rows
      totalEntries.value = data.totalEntries
    }

    const downloadCsv = async () => {
      if (!fileId.value) return
      try {
        const { data } = await api.motionData.downloadCsv(fileId.value)
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (fileName.value?.replace(/\.bin$/i, '') || 'motion') + '.csv'
        a.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        ElMessage.error('下载失败')
      }
    }

    onMounted(async () => {
      await fetchConfig()
      
      // 监听窗口大小变化
      window.addEventListener('resize', handleResize)
    })

    onUnmounted(() => {
      // 清理图表实例
      if (leftChartInstance) {
        leftChartInstance.dispose()
        leftChartInstance = null
      }
      if (rightChartInstance) {
        rightChartInstance.dispose()
        rightChartInstance = null
      }
      
      // 清理Three.js资源
      if (threeRenderer) {
        threeRenderer.dispose()
        threeRenderer = null
      }
      if (threeContainer.value) {
        threeContainer.value.innerHTML = ''
      }
      
      // 清理播放控制
      if (playbackInterval) {
        clearInterval(playbackInterval)
      }
      if (threeRotationId) {
        cancelAnimationFrame(threeRotationId)
      }
      
      // 移除事件监听器
      window.removeEventListener('resize', handleResize)
    })

    return {
      fileId, fileName, fileSize, totalEntries, currentPage, pageSize, rows, columnsToShow,
      leftHandChart, rightHandChart, threeContainer, threeInitialized, threeRotationEnabled,
      isPlaying, currentFrame, playbackSpeed,
      handleUploadRequest, fetchPreview, downloadCsv, prettySize,
      resetZoom, resetThreeView, toggleThreeRotation,
      playData, pauseData, stopData, seekToFrame
    }
  }
}
</script>

<style scoped>
.data-replay { 
  display: flex; 
  flex-direction: column; 
  gap: 16px; 
  padding: 16px;
  min-height: 100vh;
}

.control-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.upload-section {
  display: flex;
  gap: 12px;
  align-items: center;
}

.file-info {
  display: flex;
  gap: 16px;
  color: #666;
}

.info-item {
  font-size: 14px;
}

.charts-section {
  margin-bottom: 16px;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-header h3 {
  margin: 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}

.chart-controls, .three-controls {
  display: flex;
  gap: 8px;
}

.chart-container {
  flex: 1;
  min-height: 300px;
}

.three-section {
  margin-bottom: 16px;
}

.three-chart {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.three-container {
  flex: 1;
  min-height: 400px;
  position: relative;
  background: #f0f0f0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.three-placeholder {
  text-align: center;
  color: #666;
}

.three-placeholder p {
  margin: 4px 0;
  font-size: 14px;
}

.playback-controls {
  margin-top: auto;
}

.playback-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.playback-buttons {
  display: flex;
  gap: 8px;
}

.playback-info {
  display: flex;
  gap: 16px;
  color: #666;
  font-size: 14px;
}

.speed-control {
  min-width: 100px;
}

.timeline-row {
  width: 100%;
}

.timeline-slider {
  width: 100%;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
  
  .control-row {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .playback-row {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .chart-container {
    min-height: 250px;
  }
  
  .three-container {
    min-height: 300px;
  }
}

@media (max-width: 768px) {
  .data-replay {
    padding: 8px;
  }
  
  .chart-card, .three-chart {
    padding: 12px;
  }
  
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
 
