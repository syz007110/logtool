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
            <el-button type="primary" icon="Upload">{{ $t('dataReplay.uploadBinaryFile') }}</el-button>
          </el-upload>
          <el-button :disabled="!fileId" @click="downloadCsv" plain icon="Download">{{ $t('dataReplay.downloadCSV') }}</el-button>
        </div>
        
        <div class="file-info" v-if="fileName">
          <span class="info-item">{{ $t('dataReplay.fileLabel') }}: {{ fileName }}</span>
          <span class="info-item">{{ $t('dataReplay.sizeLabel') }}: {{ prettySize(fileSize) }}</span>
          <span class="info-item">{{ $t('dataReplay.totalEntriesLabel') }}: {{ totalEntries }}</span>
        </div>
      </div>
    </el-card>

    

    

    
  </div>
</template>

<script>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'
import * as THREE from 'three'
import api from '../api'

export default {
  name: 'DataReplay',
  setup() {
    const { t } = useI18n()
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
    let currentArmModel = ref('mdh') // 'mdh' 或 'test'
    let currentArmGroup = null // 当前显示的机械臂组

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

    // MDH参数定义（左手主控制臂）
    const MDH_PARAMS = {
      pi: 3.1415926535897932384626,
      L1: 0.166,
      L2: 0.3,
      L3: 0.35,
      L4: 0.145,
      // MDH矩阵 [a, alpha, d, theta]
      dh: [
        [0, 0, -0.166, 0],
        [0, -Math.PI / 2, 0, Math.PI / 2],
        [0.3, 0, 0, -Math.PI / 2],
        [0.35, Math.PI / 2, 0.145, 0],
        [0, -Math.PI / 2, 0, 0],
        [0, Math.PI / 2, 0, Math.PI / 2],
        [0, Math.PI / 2, 0, Math.PI]
      ]
    }

    // 创建机械臂关节
    const createJoint = (radius = 0.05, height = 0.1, color = 0x666666) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 8)
      const material = new THREE.MeshPhongMaterial({ color })
      const joint = new THREE.Mesh(geometry, material)
      joint.rotation.z = Math.PI / 2 // 使圆柱体沿X轴方向
      return joint
    }

    // 创建机械臂连杆
    const createLink = (length, radius = 0.02, color = 0x444444) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 8)
      const material = new THREE.MeshPhongMaterial({ color })
      const link = new THREE.Mesh(geometry, material)
      link.rotation.z = Math.PI / 2 // 使圆柱体沿X轴方向
      return link
    }

    // 计算MDH变换矩阵
    const calculateMDHMatrix = (a, alpha, d, theta) => {
      const matrix = new THREE.Matrix4()
      
      // 计算旋转和平移
      const cosTheta = Math.cos(theta)
      const sinTheta = Math.sin(theta)
      const cosAlpha = Math.cos(alpha)
      const sinAlpha = Math.sin(alpha)
      
      matrix.set(
        cosTheta, -sinTheta * cosAlpha, sinTheta * sinAlpha, a * cosTheta,
        sinTheta, cosTheta * cosAlpha, -cosTheta * sinAlpha, a * sinTheta,
        0, sinAlpha, cosAlpha, d,
        0, 0, 0, 1
      )
      
      return matrix
    }

    // 创建文本标签
    const createTextLabel = (text, position, color = 0x000000) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = 256
      canvas.height = 64
      
      // 设置背景
      context.fillStyle = 'rgba(255, 255, 255, 0.9)'
      context.fillRect(0, 0, canvas.width, canvas.height)
      
      // 设置边框
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      context.lineWidth = 3
      context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
      
      // 设置文字
      context.fillStyle = `rgb(${color >> 16}, ${(color >> 8) & 255}, ${color & 255})`
      context.font = 'bold 20px Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, canvas.width / 2, canvas.height / 2)
      
      // 创建纹理和材质
      const texture = new THREE.CanvasTexture(canvas)
      const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.9
      })
      const sprite = new THREE.Sprite(material)
      
      // 设置位置和大小
      sprite.position.copy(position)
      sprite.scale.set(0.4, 0.1, 1)
      
      return sprite
    }

    // 创建左手主控制臂
    const createLeftMasterArm = () => {
      const armGroup = new THREE.Group()
      armGroup.name = 'leftMasterArm'
      
      // 创建7个关节
      const joints = []
      const links = []
      
      for (let i = 0; i < 7; i++) {
        const joint = createJoint(0.05, 0.1, 0x666666)
        joint.name = `leftJoint${i + 1}`
        joints.push(joint)
        
        if (i < 6) { // 6个连杆
          const linkLength = MDH_PARAMS.dh[i][0] // a参数作为连杆长度
          const link = createLink(linkLength, 0.02, 0x444444)
          link.name = `leftLink${i + 1}`
          links.push(link)
        }
      }
      
      // 设置初始位置和变换
      let currentMatrix = new THREE.Matrix4()
      
      for (let i = 0; i < 7; i++) {
        const [a, alpha, d, theta] = MDH_PARAMS.dh[i]
        const dhMatrix = calculateMDHMatrix(a, alpha, d, theta)
        
        // 应用MDH变换
        currentMatrix.multiply(dhMatrix)
        
        // 设置关节位置
        const joint = joints[i]
        joint.position.setFromMatrixPosition(currentMatrix)
        joint.setRotationFromMatrix(currentMatrix)
        armGroup.add(joint)
        
        // 设置连杆位置（如果有）
        if (i < 6) {
          const link = links[i]
          const linkLength = MDH_PARAMS.dh[i][0] // a参数作为连杆长度
          // 连杆位置在关节之间
          const linkMatrix = currentMatrix.clone()
          linkMatrix.multiply(calculateMDHMatrix(linkLength / 2, 0, 0, 0))
          link.position.setFromMatrixPosition(linkMatrix)
          link.setRotationFromMatrix(linkMatrix)
          armGroup.add(link)
        }
      }
      
      return armGroup
    }

    // 创建测试机械臂模型（基于threetest.js）
    const createTestArmModel = () => {
      const armGroup = new THREE.Group()
      armGroup.name = 'testArmModel'
      
      // 底座
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 0.5, 32),
        new THREE.MeshStandardMaterial({ color: 0x555555 })
      )
      base.position.y = 0.25
      armGroup.add(base)
      
      // 第一段连杆
      const link1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 3),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      )
      link1.position.y = 1.5 // 调整中心位置
      base.add(link1)
      
      // 第一个关节
      const joint1 = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0x0000ff })
      )
      joint1.position.y = 1.5
      link1.add(joint1)
      
      // 第二段连杆
      const link2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 2),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
      )
      link2.position.y = 1 // 相对于 joint1
      joint1.add(link2)
      
      // 第二个关节
      const joint2 = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xff00ff })
      )
      joint2.position.y = 1
      link2.add(joint2)
      
      // 第三段连杆
      const link3 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xffff00 })
      )
      link3.position.y = 0.75
      joint2.add(link3)
      
      // 添加标签
      const baseLabel = createTextLabel('底座', new THREE.Vector3(0, 0.5, 1.2), 0x555555)
      armGroup.add(baseLabel)
      
      const link1Label = createTextLabel('连杆1', new THREE.Vector3(0, 2, 0.3), 0xff0000)
      armGroup.add(link1Label)
      
      const joint1Label = createTextLabel('关节1', new THREE.Vector3(0, 1.5, 0.3), 0x0000ff)
      armGroup.add(joint1Label)
      
      const link2Label = createTextLabel('连杆2', new THREE.Vector3(0, 2.5, 0.3), 0x00ff00)
      armGroup.add(link2Label)
      
      return armGroup
    }



    // 初始化Three.js场景
    const initThreeScene = () => {
      if (!threeContainer.value) {
        console.warn('3D容器不存在')
        return
      }
      
      try {
      
      // 创建场景
      threeScene = new THREE.Scene()
      threeScene.background = new THREE.Color(0xf5f5f5)
      
      // 创建相机
      threeCamera = new THREE.PerspectiveCamera(
        60,
        threeContainer.value.clientWidth / threeContainer.value.clientHeight,
        0.1,
        1000
      )
      threeCamera.position.set(2, 2, 2)
      threeCamera.lookAt(0, 0, 0)
      
      // 创建渲染器
      threeRenderer = new THREE.WebGLRenderer({ antialias: true })
      threeRenderer.setSize(threeContainer.value.clientWidth, threeContainer.value.clientHeight)
      threeRenderer.shadowMap.enabled = true
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap
      
      // 清空容器并添加渲染器
      threeContainer.value.innerHTML = ''
      threeContainer.value.appendChild(threeRenderer.domElement)
      
      // 添加光源
      const ambientLight = new THREE.AmbientLight(0x404040, 0.4)
      threeScene.add(ambientLight)
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(5, 5, 5)
      directionalLight.castShadow = true
      directionalLight.shadow.mapSize.width = 2048
      directionalLight.shadow.mapSize.height = 2048
      threeScene.add(directionalLight)
      
      // 添加坐标轴辅助
      const axesHelper = new THREE.AxesHelper(1)
      threeScene.add(axesHelper)
      
      // 创建初始机械臂模型
      currentArmGroup = createLeftMasterArm()
      currentArmGroup.position.x = 0 // 居中显示
      threeScene.add(currentArmGroup)
      
      // 添加左主控制臂标签
      const leftArmLabel = createTextLabel('左主控制臂', new THREE.Vector3(0, 0.6, 0), 0x0066cc)
      leftArmLabel.userData.isArmLabel = true
      threeScene.add(leftArmLabel)
      
      // 添加地面网格
      const gridHelper = new THREE.GridHelper(4, 20, 0xcccccc, 0xcccccc)
      gridHelper.position.y = -0.5
      threeScene.add(gridHelper)
      
      // 渲染场景
      threeRenderer.render(threeScene, threeCamera)
      threeInitialized.value = true
      
      // 添加鼠标控制
      addMouseControls()
    } catch (error) {
      console.error('初始化3D场景失败:', error)
      ElMessage.error(t('dataReplay.threeSceneInitFailed'))
    }
    }

    // 添加鼠标控制
    const addMouseControls = () => {
      let isMouseDown = false
      let mouseX = 0
      let mouseY = 0
      
      const onMouseDown = (event) => {
        isMouseDown = true
        mouseX = event.clientX
        mouseY = event.clientY
      }
      
      const onMouseMove = (event) => {
        if (!isMouseDown) return
        
        const deltaX = event.clientX - mouseX
        const deltaY = event.clientY - mouseY
        
        // 旋转相机
        const spherical = new THREE.Spherical()
        spherical.setFromVector3(threeCamera.position)
        spherical.theta -= deltaX * 0.01
        spherical.phi += deltaY * 0.01
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi))
        
        threeCamera.position.setFromSpherical(spherical)
        threeCamera.lookAt(0, 0, 0)
        threeRenderer.render(threeScene, threeCamera)
        
        mouseX = event.clientX
        mouseY = event.clientY
      }
      
      const onMouseUp = () => {
        isMouseDown = false
      }
      
      const onWheel = (event) => {
        const zoomSpeed = 0.1
        const direction = event.deltaY > 0 ? 1 : -1
        const distance = threeCamera.position.distanceTo(new THREE.Vector3(0, 0, 0))
        const newDistance = Math.max(0.5, Math.min(10, distance + direction * zoomSpeed))
        
        threeCamera.position.normalize().multiplyScalar(newDistance)
        threeRenderer.render(threeScene, threeCamera)
      }
      
      threeContainer.value.addEventListener('mousedown', onMouseDown)
      threeContainer.value.addEventListener('mousemove', onMouseMove)
      threeContainer.value.addEventListener('mouseup', onMouseUp)
      threeContainer.value.addEventListener('wheel', onWheel)
      
      // 保存事件监听器引用以便清理
      threeContainer.value._mouseListeners = {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onWheel
      }
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
        threeCamera.position.set(2, 2, 2)
        threeCamera.lookAt(0, 0, 0)
        threeRenderer.render(threeScene, threeCamera)
      }
    }

    // 切换机械臂模型
    const switchArmModel = () => {
      if (!threeScene || !currentArmGroup) return
      
      // 移除当前模型和标签
      threeScene.remove(currentArmGroup)
      
      // 清理旧的标签
      const oldLabels = threeScene.children.filter(child => 
        child.type === 'Sprite' && 
        (child.userData.isArmLabel || child.material?.map?.image?.src?.includes('左主控制臂') || child.material?.map?.image?.src?.includes('测试机械臂'))
      )
      oldLabels.forEach(label => threeScene.remove(label))
      
      // 切换模型类型
      if (currentArmModel.value === 'mdh') {
        currentArmModel.value = 'test'
        currentArmGroup = createTestArmModel()
        currentArmGroup.position.x = 0
        threeScene.add(currentArmGroup)
        
        // 更新标签
        const testArmLabel = createTextLabel('测试机械臂', new THREE.Vector3(0, 0.6, 0), 0x0066cc)
        testArmLabel.userData.isArmLabel = true
        threeScene.add(testArmLabel)
      } else {
        currentArmModel.value = 'mdh'
        currentArmGroup = createLeftMasterArm()
        currentArmGroup.position.x = 0
        threeScene.add(currentArmGroup)
        
        // 更新标签
        const leftArmLabel = createTextLabel('左主控制臂', new THREE.Vector3(0, 0.6, 0), 0x0066cc)
        leftArmLabel.userData.isArmLabel = true
        threeScene.add(leftArmLabel)
      }
      
      // 重新渲染
      threeRenderer.render(threeScene, threeCamera)
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
        ElMessage.error(t('dataReplay.uploadFailed'))
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
        ElMessage.error(t('dataReplay.downloadFailed'))
      }
    }

    onMounted(async () => {
      await fetchConfig()
      
      // 初始化3D场景
      nextTick(() => {
        initThreeScene()
      })
      
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
        // 清理鼠标事件监听器
        if (threeContainer.value._mouseListeners) {
          const { onMouseDown, onMouseMove, onMouseUp, onWheel } = threeContainer.value._mouseListeners
          threeContainer.value.removeEventListener('mousedown', onMouseDown)
          threeContainer.value.removeEventListener('mousemove', onMouseMove)
          threeContainer.value.removeEventListener('mouseup', onMouseUp)
          threeContainer.value.removeEventListener('wheel', onWheel)
        }
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
      currentArmModel, isPlaying, currentFrame, playbackSpeed,
      handleUploadRequest, fetchPreview, downloadCsv, prettySize,
      resetZoom, resetThreeView, toggleThreeRotation, switchArmModel,
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
  min-height: 600px;
  position: relative;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #e1e8ed;
}

.three-placeholder {
  text-align: center;
  color: #666;
  background: rgba(255, 255, 255, 0.8);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.three-placeholder p {
  margin: 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.model-info {
  margin-bottom: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.info-card {
  text-align: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  height: 100%;
  transition: all 0.3s ease;
}

.info-card.active {
  border-color: #409eff;
  background: #f0f9ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.info-card h4 {
  margin: 0 0 8px 0;
  color: #495057;
  font-size: 14px;
  font-weight: 600;
}

.info-card p {
  margin: 4px 0;
  color: #6c757d;
  font-size: 12px;
  line-height: 1.4;
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
    min-height: 400px;
  }
  
  .model-info .el-col {
    margin-bottom: 12px;
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
  

  
  .model-info {
    padding: 12px;
  }
  
  .info-card {
    padding: 8px;
  }
  
  .info-card h4 {
    font-size: 13px;
  }
  
  .info-card p {
    font-size: 11px;
  }
}
</style>
 
