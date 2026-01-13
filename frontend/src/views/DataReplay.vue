<template>
  <div class="data-replay-container">
    <!-- 统一卡片布局 -->
    <el-card class="main-card">
      <!-- 操作栏 -->
      <div class="action-bar">
        <div class="action-section">
          <el-upload
            action=""
            :http-request="handleBatchUploadRequest"
            :show-file-list="false"
            accept=".bin"
            multiple
            :limit="5"
            :on-exceed="handleExceed"
            :before-upload="beforeBatchUpload"
            :on-change="handleFileChange"
            :auto-upload="false"
            ref="uploadRef"
          >
            <el-button type="primary" icon="Upload" :disabled="uploading || processing">上传文件（最多5个）</el-button>
          </el-upload>
          <el-button 
            type="success" 
            :disabled="uploadedFiles.length === 0 || uploading || processing" 
            @click="batchDownloadCsv" 
            icon="Download"
            :loading="processing"
          >
            批量下载ZIP（{{ uploadedFiles.length }}个文件）
          </el-button>
        </div>
        
        <div class="file-info" v-if="fileName && !batchMode">
          <span class="info-item">{{ $t('dataReplay.fileLabel') }}: {{ fileName }}</span>
          <span class="info-item">{{ $t('dataReplay.sizeLabel') }}: {{ prettySize(fileSize) }}</span>
          <span class="info-item">{{ $t('dataReplay.totalEntriesLabel') }}: {{ totalEntries }}</span>
        </div>
      </div>

      <!-- 上传进度条 -->
      <div v-if="uploading" class="progress-section">
        <div class="progress-header">
          <span>正在上传文件...</span>
          <span class="progress-text">{{ uploadProgressText }}</span>
        </div>
        <el-progress 
          :percentage="uploadProgress" 
          :status="uploadProgress === 100 ? 'success' : undefined"
          :stroke-width="8"
        />
      </div>

      <!-- 下载/打包进度条 -->
      <div v-if="processing" class="progress-section">
        <div class="progress-header">
          <span>正在解析并打包文件...</span>
          <span class="progress-text">{{ processingProgressText }}</span>
        </div>
        <el-progress 
          :percentage="processingProgress" 
          :status="processingProgress === 100 ? 'success' : undefined"
          :stroke-width="8"
          :indeterminate="processingProgress < 100 && processingProgress > 0"
        />
      </div>

      <!-- 3D可视化区域（临时隐藏三维模型） -->
      <div class="three-section" v-if="fileId && showThreeModel">
        <div class="chart-header">
          <h3>右主控制臂三维模型</h3>
          <div class="three-controls" v-if="dataLoaded">
            <el-button size="small" @click="resetThreeView">重置视角</el-button>
            <el-button size="small" @click="toggleThreeRotation">
              {{ threeRotationEnabled ? '停止旋转' : '自动旋转' }}
            </el-button>
          </div>
        </div>
        <div ref="threeContainer" class="three-container">
          <div v-if="!dataLoaded" class="three-placeholder">
            <p>正在解析数据...</p>
          </div>
          <div v-else-if="!threeInitialized" class="three-placeholder">
            <p>正在初始化3D场景...</p>
          </div>
        </div>
        
        <!-- 调试信息（临时） -->
        <div v-if="fileId" class="debug-info">
          <p>调试信息: dataLoaded={{ dataLoaded }}, totalEntries={{ totalEntries }}, rows.length={{ rows ? rows.length : 0 }}</p>
        </div>
        
        <!-- 播放控制面板 -->
        <div class="playback-controls" v-if="dataLoaded && totalEntries > 0 && rows && rows.length > 0">
          <div class="playback-row">
            <div class="playback-buttons">
              <el-button 
                :icon="isPlaying ? 'VideoPause' : 'VideoPlay'" 
                @click="isPlaying ? pauseData() : playData()"
                :disabled="!fileId"
                size="small"
              >
                {{ isPlaying ? '暂停' : '播放' }}
              </el-button>
              <el-button 
                icon="VideoStop" 
                @click="stopData"
                :disabled="!fileId || !isPlaying"
                size="small"
              >
                停止
              </el-button>
            </div>
            
            <div class="playback-info">
              <span>帧: {{ currentFrame }} / {{ totalEntries }}</span>
              <el-slider
                v-if="totalEntries > 0"
                v-model="currentFrame"
                :min="1"
                :max="totalEntries"
                :step="1"
                @change="seekToFrame"
                style="width: 200px; margin: 0 16px;"
                :disabled="isPlaying"
              />
              <el-select v-model="playbackSpeed" size="small" style="width: 100px">
                <el-option label="0.5x" :value="0.5" />
                <el-option label="1x" :value="1" />
                <el-option label="2x" :value="2" />
                <el-option label="5x" :value="5" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import api from '../api'
import { getTableHeight } from '@/utils/tableHeight'
import websocketClient from '../services/websocketClient'

export default {
  name: 'DataReplay',
  setup() {
    const { t } = useI18n()
    const fileId = ref('')
    // 临时关闭三维模型显示
    const showThreeModel = ref(false)
    const fileName = ref('')
    const fileSize = ref(0)
    const totalEntries = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(500)
    const rows = ref([])
    const columns = ref([])
    const dataLoaded = ref(false) // 数据是否已加载完成

    // 批量上传相关状态
    const uploadedFiles = ref([]) // 已上传文件列表 [{ id, filename, size, status }]
    const uploading = ref(false) // 是否正在上传
    const processing = ref(false) // 是否正在处理/下载
    const batchMode = ref(false) // 是否为批量模式
    const uploadProgress = ref(0) // 上传进度 0-100
    const uploadProgressText = ref('') // 上传进度文本
    const processingProgress = ref(0) // 处理进度 0-100
    const processingProgressText = ref('') // 处理进度文本
    
    // 任务状态管理
    const activeTasks = ref(new Map()) // taskId -> { type: 'upload'|'download', status, progress, result, error }
    let taskPollingIntervals = new Map() // taskId -> intervalId

    // 3D容器引用
    const threeContainer = ref(null)
    let threeScene = null
    let threeRenderer = null
    let threeCamera = null
    let threeInitialized = ref(false)
    let worldGroup = null  // 世界坐标系根组
    let threeRotationEnabled = ref(false)
    let threeRotationId = null
    let currentArmModel = ref('mdh') // 'mdh' 或 'test'
    let currentArmGroup = null // 当前显示的机械臂组

    // ==========================================
    // 机械臂配置与状态
    // ==========================================
    
    // 存储机械臂关节引用
    const robotJoints = {
      left: [],  // 虽然本次主要做右臂，但预留左臂结构
      right: []
    }

    // 右主控制臂几何配置表 (初始为空，从外部文件加载)
    const rightArmGeometry = ref({})

    // 右主控制臂层级结构配置表 (初始为空，从外部文件加载)
    const rightArmHierarchy = ref(null)
    const hierarchyConfig = ref(null)  // 存储完整的层级配置文件（包含worldOrientation）

    // 右主控制臂 DH 参数表 (从后端配置文件加载)
    // 格式: { a, alpha, d, theta }
    // a: 连杆长度, alpha: 连杆扭转角, d: 连杆偏距, theta: 关节角初始偏移
    const rightArmDH = ref([])

    // 加载几何配置
    const loadGeometryConfig = async () => {
      try {
        const response = await fetch('/robot_arm_geometry.json')
        if (response.ok) {
          rightArmGeometry.value = await response.json()
        } else {
          console.warn('无法加载几何配置文件，使用默认配置')
        }
      } catch (error) {
        console.error('加载几何配置文件失败:', error)
      }
    }

    // 加载层级结构配置
    const loadHierarchyConfig = async () => {
      try {
        const response = await fetch('/robot_arm_hierarchy.json')
        if (response.ok) {
          const hierarchyData = await response.json()
          // 存储完整的配置文件（包含worldOrientation）
          hierarchyConfig.value = hierarchyData
          // 使用 masterArm 的层级结构（右主控制臂）
          rightArmHierarchy.value = hierarchyData.masterArm || null
        } else {
          console.warn('无法加载层级结构配置文件，将使用默认链式结构')
          hierarchyConfig.value = null
          rightArmHierarchy.value = null
        }
      } catch (error) {
        console.error('加载层级结构配置文件失败:', error)
        rightArmHierarchy.value = null
      }
    }

    // 播放控制
    const isPlaying = ref(false)
    const currentFrame = ref(1)
    const playbackSpeed = ref(1)
    let playbackInterval = null

    // 表格高度计算（预留，用于可能的表格展示）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })
    
    // 确保 currentFrame 不会超出范围
    watch([currentFrame, totalEntries], ([frame, total]) => {
      if (total > 0 && frame > total) {
        currentFrame.value = total
      } else if (frame < 1) {
        currentFrame.value = 1
      }
    })

    const prettySize = (size) => {
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
      return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
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
    // 参考MATLAB: T = [cos(theta), -sin(theta), 0, a;
    //                  sin(theta)*cos(alpha), cos(theta)*cos(alpha), -sin(alpha), -d*sin(alpha);
    //                  sin(theta)*sin(alpha), cos(theta)*sin(alpha), cos(alpha), d*cos(alpha);
    //                  0, 0, 0, 1]
    const calculateMDHMatrix = (a, alpha, d, theta) => {
      const matrix = new THREE.Matrix4()
      
      // 计算旋转和平移
      const cosTheta = Math.cos(theta)
      const sinTheta = Math.sin(theta)
      const cosAlpha = Math.cos(alpha)
      const sinAlpha = Math.sin(alpha)
      
      matrix.set(
        cosTheta, -sinTheta, 0, a,
        sinTheta * cosAlpha, cosTheta * cosAlpha, -sinAlpha, -d * sinAlpha,
        sinTheta * sinAlpha, cosTheta * sinAlpha, cosAlpha, d * cosAlpha,
        0, 0, 0, 1
      )
      
      return matrix
    }

    // 通用机械臂构建函数 (模块化/嵌套结构/可配置几何体/可配置层级)
    // @param name: 机械臂名称
    // @param dhParams: DH参数数组
    // @param geometryConfig: 几何体配置对象
    // @param hierarchyConfig: 层级结构配置对象 (可选)
    // 辅助函数：根据配置创建几何体
    const createGeometryFromConfig = (config) => {
      if (!config || !config.parts) return []
      
      const meshes = []
      config.parts.forEach(part => {
        let geometry, material
        
        // 创建几何体
        if (part.type === 'box') {
          geometry = new THREE.BoxGeometry(...part.args)
        } else if (part.type === 'cylinder') {
          geometry = new THREE.CylinderGeometry(...part.args)
        } else if (part.type === 'sphere') {
          geometry = new THREE.SphereGeometry(...part.args)
        }
        
        if (geometry) {
          // 创建材质
          material = new THREE.MeshPhongMaterial({ color: part.color })
          
          const mesh = new THREE.Mesh(geometry, material)
          
          // 设置位置和旋转
          if (part.position) mesh.position.set(...part.position)
          if (part.rotation) mesh.rotation.set(...part.rotation)
          
          meshes.push(mesh)
        }
      })
      
      return meshes
    }

    const createRobotArm = (name, dhParams, geometryConfig = {}, hierarchyConfig = null) => {
      const rootGroup = new THREE.Group()
      rootGroup.name = name
      
      const joints = []
      const jointMap = new Map() // 用于根据名称查找关节组
      const baseName = hierarchyConfig?.root || 'base'
      jointMap.set(baseName, rootGroup)

      // 应用基座坐标系方向（如果配置了）
      if (hierarchyConfig?.rootOrientation) {
        const orientation = hierarchyConfig.rootOrientation
        if (Array.isArray(orientation) && orientation.length >= 3) {
          // 使用欧拉角设置旋转 [x, y, z] (弧度)
          rootGroup.rotation.set(orientation[0], orientation[1], orientation[2])
        }
      }

      // 加载基座的几何配置
      const baseConfig = geometryConfig[baseName] || geometryConfig['base']
      if (baseConfig && baseConfig.parts) {
        const baseMeshes = createGeometryFromConfig(baseConfig)
        baseMeshes.forEach(mesh => {
          rootGroup.add(mesh)
        })
      }

      // 如果有层级配置，按配置顺序创建关节；否则按DH参数顺序（向后兼容）
      const jointOrder = hierarchyConfig?.joints || dhParams.map((_, idx) => ({
        name: `joint${idx + 1}`,
        parent: idx === 0 ? (hierarchyConfig?.root || 'base') : `joint${idx}`,
        dhIndex: idx
      }))

      jointOrder.forEach((jointDef) => {
        const dhIndex = jointDef.dhIndex !== undefined ? jointDef.dhIndex : parseInt(jointDef.name.replace('joint', '')) - 1
        const param = dhParams[dhIndex]
        
        if (!param) {
          console.warn(`DH参数索引 ${dhIndex} 不存在，跳过关节 ${jointDef.name}`)
          return
        }

        // 1. 创建关节组 (坐标系容器)
        const jointGroup = new THREE.Group()
        jointGroup.name = `${name}_${jointDef.name}`
        
        // 存储参数方便后续更新
        jointGroup.userData = {
          dh: { ...param },
          index: dhIndex,
          jointName: jointDef.name
        }

        // 2. 创建可视化几何体 (基于配置)
        const configKey = jointDef.name
        const jointConfig = geometryConfig[configKey]

        if (jointConfig && jointConfig.parts) {
          // 如果有配置，根据配置生成几何体
          const jointMeshes = createGeometryFromConfig(jointConfig)
          jointMeshes.forEach(mesh => {
            jointGroup.add(mesh)
          })
        } else {
          // 如果没有配置，使用默认的球体+连杆显示 (Fallback)
          // 2.1 关节球体
          const jointMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 32, 32),
            new THREE.MeshPhongMaterial({ color: 0x0066cc })
          )
          jointGroup.add(jointMesh)
          
          // 2.2 X轴连杆 (参数 a)
          if (Math.abs(param.a) > 0.001) {
             const linkLength = Math.abs(param.a)
             const linkGeo = new THREE.CylinderGeometry(0.02, 0.02, linkLength, 16)
             const linkMat = new THREE.MeshPhongMaterial({ color: 0x888888 })
             const linkMesh = new THREE.Mesh(linkGeo, linkMat)
             linkMesh.rotation.z = -Math.PI / 2
             linkMesh.position.x = param.a / 2
             jointGroup.add(linkMesh)
          }
          
          // 2.3 Z轴偏移 (参数 d)
          if (Math.abs(param.d) > 0.001) {
             const offsetLength = Math.abs(param.d)
             const offsetGeo = new THREE.CylinderGeometry(0.025, 0.025, offsetLength, 16)
             const offsetMat = new THREE.MeshPhongMaterial({ color: 0x666666 })
             const offsetMesh = new THREE.Mesh(offsetGeo, offsetMat)
             offsetMesh.rotation.x = Math.PI / 2
             offsetMesh.position.z = param.d / 2
             jointGroup.add(offsetMesh)
          }
        }
        
        // 坐标轴辅助 (显示关节坐标系)
        const axis = new THREE.AxesHelper(0.15)
        jointGroup.add(axis)

        // 添加关节标签
        const jointNumber = parseInt(jointDef.name.replace('joint', ''))
        const jointLabel = createTextLabel(`关节${jointNumber}`, new THREE.Vector3(0, 0.15, 0), 0x0066cc)
        jointGroup.add(jointLabel)

        // 3. 建立层级关系（基于配置文件）
        const parentName = jointDef.parent
        const parentGroup = jointMap.get(parentName)
        
        if (!parentGroup) {
          console.warn(`找不到父节点 "${parentName}"，将关节 ${jointDef.name} 添加到根节点`)
          rootGroup.add(jointGroup)
        } else {
          parentGroup.add(jointGroup)
        }
        
        // 将关节组添加到映射表
        jointMap.set(jointDef.name, jointGroup)
        
        // 4. 设置初始位姿
        // DH参数统一表示：关节i相对于其父坐标系（基座或前一个关节）的变换
        // dhIndex 0: 关节1相对于基座坐标系
        // dhIndex 1: 关节2相对于关节1
        // ...
        // dhIndex 6: 关节7相对于关节6
        const matrix = calculateMDHMatrix(param.a, param.alpha, param.d, param.theta || 0)
        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        matrix.decompose(pos, quat, scale)
        
        jointGroup.position.copy(pos)
        jointGroup.quaternion.copy(quat)
        
        // 记录引用（按DH参数索引顺序）
        joints[dhIndex] = jointGroup
      })

      // 确保joints数组连续（移除undefined）
      const validJoints = joints.filter(j => j !== undefined)

      return { root: rootGroup, joints: validJoints }
    }
    
    // 更新机械臂关节角度
    const updateArmPose = (joints, currentAngles) => {
      if (!joints || !joints.length) return

      joints.forEach((joint, i) => {
        if (i >= currentAngles.length) return
        
        const angle = currentAngles[i]
        const dh = joint.userData.dh
        
        // 计算新的局部变换矩阵
        // theta = 初始偏移 + 实时角度
        const matrix = calculateMDHMatrix(dh.a, dh.alpha, dh.d, dh.theta + angle)
        
        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        matrix.decompose(pos, quat, scale)
        
        joint.position.copy(pos)
        joint.quaternion.copy(quat)
      })
    }

    // 创建文本标签（无背景，只显示文字）
    const createTextLabel = (text, position, color = 0x000000) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = 256
      canvas.height = 64
      
      // 不设置背景和边框，只显示文字
      // 设置文字
      context.fillStyle = `rgb(${color >> 16}, ${(color >> 8) & 255}, ${color & 255})`
      context.font = 'bold 24px Arial'
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
        console.warn('3D容器不存在，延迟初始化')
        // 如果容器还不存在，等待下一个tick
        nextTick(() => {
          if (threeContainer.value) {
            initThreeScene()
          }
        })
        return
      }
      
      // 如果已经初始化过，先清理并重新初始化
      if (threeInitialized.value) {
        // 清理旧的场景
        if (worldGroup) {
          threeScene.remove(worldGroup)
          worldGroup = null
        }
        if (threeRenderer) {
          threeContainer.value?.removeChild(threeRenderer.domElement)
        }
        threeInitialized.value = false
      }
      
      try {
      // 创建场景
      threeScene = new THREE.Scene()
      threeScene.background = new THREE.Color(0xf5f5f5)
      
      // 创建世界坐标系根组（用于定义自定义世界坐标系方向）
      worldGroup = new THREE.Group()
      worldGroup.name = 'WorldCoordinateSystem'
      
      // 应用世界坐标系方向（如果配置了）
      // worldOrientation在配置文件的根级别，不在masterArm中
      const worldOrientation = hierarchyConfig.value?.worldOrientation || [0, 0, 0]
      if (Array.isArray(worldOrientation) && worldOrientation.length >= 3) {
        worldGroup.rotation.set(worldOrientation[0], worldOrientation[1], worldOrientation[2])
        console.log('应用世界坐标系旋转:', worldOrientation, '弧度')
        console.log('转换为角度:', worldOrientation.map(r => r * 180 / Math.PI), '度')
      } else {
        console.warn('worldOrientation配置无效或未找到，使用默认值 [0, 0, 0]')
      }
      
      // 将世界组添加到场景
      threeScene.add(worldGroup)
      
      // 创建相机
      threeCamera = new THREE.PerspectiveCamera(
        60,
        threeContainer.value.clientWidth / threeContainer.value.clientHeight,
        0.1,
        1000
      )
      threeCamera.position.set(4, 4, 4)
      threeCamera.lookAt(0, 0, 0)
      
      // 创建渲染器
      threeRenderer = new THREE.WebGLRenderer({ antialias: true })
      threeRenderer.setSize(threeContainer.value.clientWidth, threeContainer.value.clientHeight)
      threeRenderer.shadowMap.enabled = true
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap
      
      // 清空容器并添加渲染器
      threeContainer.value.innerHTML = ''
      threeContainer.value.appendChild(threeRenderer.domElement)
      
      // 添加光源（光源不随世界坐标系旋转，直接添加到场景）
      const ambientLight = new THREE.AmbientLight(0x404040, 0.4)
      threeScene.add(ambientLight)
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(5, 5, 5)
      directionalLight.castShadow = true
      directionalLight.shadow.mapSize.width = 2048
      directionalLight.shadow.mapSize.height = 2048
      threeScene.add(directionalLight)
      
      // 添加世界坐标系（Three.js默认坐标系，不受worldOrientation影响）
      const worldAxisLength = 1.5 // 世界坐标系轴长度（稍大以便区分）
      const worldAxesGroup = new THREE.Group()
      worldAxesGroup.name = 'WorldCoordinateSystem'
      
      const worldAxesHelper = new THREE.AxesHelper(worldAxisLength)
      worldAxesGroup.add(worldAxesHelper)
      
      // 为世界坐标系添加标签
      const worldLabelOffset = 0.25
      const worldXLabel = createTextLabel('X_w', new THREE.Vector3(worldAxisLength + worldLabelOffset, 0, 0), 0xff0000)
      worldAxesGroup.add(worldXLabel)
      const worldYLabel = createTextLabel('Y_w', new THREE.Vector3(0, worldAxisLength + worldLabelOffset, 0), 0x00ff00)
      worldAxesGroup.add(worldYLabel)
      const worldZLabel = createTextLabel('Z_w', new THREE.Vector3(0, 0, worldAxisLength + worldLabelOffset), 0x0000ff)
      worldAxesGroup.add(worldZLabel)
      
      // 世界坐标系直接添加到场景（不受worldOrientation影响）
      threeScene.add(worldAxesGroup)
      
      // 添加基座坐标系（应用rootOrientation，相对于世界坐标系）
      const baseAxisLength = 1.2 // 基座坐标系轴长度
      const baseAxesGroup = new THREE.Group()
      baseAxesGroup.name = 'BaseCoordinateSystem'

      // 使用层级配置里的 rootOrientation 对坐标轴做同样的旋转
      const baseOrientation = rightArmHierarchy.value?.rootOrientation || [0, 0, 0]
      if (Array.isArray(baseOrientation) && baseOrientation.length >= 3) {
        baseAxesGroup.rotation.set(baseOrientation[0], baseOrientation[1], baseOrientation[2])
      }

      const baseAxesHelper = new THREE.AxesHelper(baseAxisLength)
      baseAxesGroup.add(baseAxesHelper)
      
      // 为基座坐标系添加标签（添加到 baseAxesGroup 中，这样也会一起旋转）
      const baseLabelOffset = 0.2 // 标签距离轴末端的偏移
      
      // X轴标签（红色）
      const baseXLabel = createTextLabel('X_b', new THREE.Vector3(baseAxisLength + baseLabelOffset, 0, 0), 0xff0000)
      baseAxesGroup.add(baseXLabel)
      
      // Y轴标签（绿色）
      const baseYLabel = createTextLabel('Y_b', new THREE.Vector3(0, baseAxisLength + baseLabelOffset, 0), 0x00ff00)
      baseAxesGroup.add(baseYLabel)
      
      // Z轴标签（蓝色）
      const baseZLabel = createTextLabel('Z_b', new THREE.Vector3(0, 0, baseAxisLength + baseLabelOffset), 0x0000ff)
      baseAxesGroup.add(baseZLabel)

      // 基座坐标系添加到世界组（会随worldOrientation旋转）
      worldGroup.add(baseAxesGroup)
      
      // 创建初始机械臂模型 (使用新的构建函数创建右臂，传入 geometry 配置)
      // 确保DH参数已加载
      if (!rightArmDH.value || rightArmDH.value.length === 0) {
        console.error('DH参数未加载，无法创建机械臂模型')
        ElMessage.warning('DH参数未加载，请刷新页面重试')
        return
      }
      const rightArm = createRobotArm('RightMasterArm', rightArmDH.value, rightArmGeometry.value, rightArmHierarchy.value)
      currentArmGroup = rightArm.root
      robotJoints.right = rightArm.joints
      
      currentArmGroup.position.set(0, 0, 0) // 居中显示
      worldGroup.add(currentArmGroup)
      
      // 添加右主控制臂标签
      const rightArmLabel = createTextLabel('右主控制臂', new THREE.Vector3(0, 0.8, 0), 0xff9900)
      rightArmLabel.userData.isArmLabel = true
      worldGroup.add(rightArmLabel)
      
      // 添加地面网格
      const gridHelper = new THREE.GridHelper(4, 20, 0xcccccc, 0xcccccc)
      gridHelper.position.y = -0.5
      worldGroup.add(gridHelper)
      
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
        if (threeContainer.value) {
          threeContainer.value.style.cursor = 'grabbing'
        }
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
        if (threeContainer.value) {
          threeContainer.value.style.cursor = 'grab'
        }
      }
      
      const onWheel = (event) => {
        // 阻止默认滚动行为
        event.preventDefault()
        event.stopPropagation()
        
        // 根据滚动方向计算缩放
        const zoomSpeed = 0.05
        const delta = -event.deltaY * zoomSpeed // 负号使向上滚动放大
        
        // 计算当前相机到原点的距离
        const distance = threeCamera.position.distanceTo(new THREE.Vector3(0, 0, 0))
        
        // 计算新的距离（限制在合理范围内）
        const minDistance = 1.0
        const maxDistance = 20
        const newDistance = Math.max(minDistance, Math.min(maxDistance, distance + delta))
        
        // 更新相机位置（保持方向不变，只改变距离）
        threeCamera.position.normalize().multiplyScalar(newDistance)
        threeCamera.lookAt(0, 0, 0)
        threeRenderer.render(threeScene, threeCamera)
      }
      
      threeContainer.value.addEventListener('mousedown', onMouseDown)
      threeContainer.value.addEventListener('mousemove', onMouseMove)
      threeContainer.value.addEventListener('mouseup', onMouseUp)
      // 使用 { passive: false } 以允许 preventDefault()
      threeContainer.value.addEventListener('wheel', onWheel, { passive: false })
      
      // 保存事件监听器引用以便清理
      threeContainer.value._mouseListeners = {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onWheel
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
      if (worldGroup && currentArmGroup) {
        worldGroup.remove(currentArmGroup)
      }
      
      // 清理旧的标签
      if (worldGroup) {
        const oldLabels = worldGroup.children.filter(child => 
          child.type === 'Sprite' && 
          (child.userData.isArmLabel || child.material?.map?.image?.src?.includes('左主控制臂') || child.material?.map?.image?.src?.includes('测试机械臂'))
        )
        oldLabels.forEach(label => worldGroup.remove(label))
      }
      
      // 切换模型类型
      if (currentArmModel.value === 'mdh') {
        currentArmModel.value = 'test'
        currentArmGroup = createTestArmModel()
        currentArmGroup.position.x = 0
        if (worldGroup) {
          worldGroup.add(currentArmGroup)
        }
        
        // 更新标签
        const testArmLabel = createTextLabel('测试机械臂', new THREE.Vector3(0, 0.6, 0), 0x0066cc)
        testArmLabel.userData.isArmLabel = true
        if (worldGroup) {
          worldGroup.add(testArmLabel)
        }
      } else {
        currentArmModel.value = 'mdh'
        // 重新创建右臂
        // 传入 rightArmGeometry 配置
        const rightArm = createRobotArm('RightMasterArm', rightArmDH.value, rightArmGeometry.value, rightArmHierarchy.value)
        currentArmGroup = rightArm.root
        robotJoints.right = rightArm.joints
        
        currentArmGroup.position.set(0, 0, 0)
        if (worldGroup) {
          worldGroup.add(currentArmGroup)
        }
        
        // 更新标签
        const label = createTextLabel('右主控制臂', new THREE.Vector3(0, 0.8, 0), 0xff9900)
        label.userData.isArmLabel = true
        if (worldGroup) {
          worldGroup.add(label)
        }
      }
      
      // 重新渲染
      threeRenderer.render(threeScene, threeCamera)
    }

    // 切换3D旋转
    const toggleThreeRotation = () => {
      threeRotationEnabled.value = !threeRotationEnabled.value
      if (threeRotationEnabled.value) {
        const animate = () => {
          if (threeRotationEnabled.value && worldGroup) {
            worldGroup.rotation.y += 0.01
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

    // 动画相关变量
    let animationFrameId = null
    let lastFrameTime = 0
    const targetFPS = 30 // 目标帧率
    const frameInterval = 1000 / targetFPS

    // 播放控制函数
    const playData = () => {
      if (isPlaying.value) return
      if (!rows.value || rows.value.length === 0) {
        ElMessage.warning('没有数据可播放')
        return
      }
      
      isPlaying.value = true
      lastFrameTime = performance.now()
      
      const animate = (currentTime) => {
        if (!isPlaying.value) return
        
        const elapsed = currentTime - lastFrameTime
        const speedMultiplier = playbackSpeed.value
        
        // 根据播放速度和经过的时间计算应该前进的帧数
        if (elapsed >= frameInterval / speedMultiplier) {
          if (currentFrame.value >= totalEntries.value) {
            stopData()
            return
          }
          
          currentFrame.value++
          seekToFrame(currentFrame.value)
          lastFrameTime = currentTime
        }
        
        animationFrameId = requestAnimationFrame(animate)
      }
      
      animationFrameId = requestAnimationFrame(animate)
    }

    const pauseData = () => {
      isPlaying.value = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    }

    const stopData = () => {
      isPlaying.value = false
      currentFrame.value = 1
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      seekToFrame(1)
    }

    const seekToFrame = (frame) => {
      currentFrame.value = frame
      
      // 更新3D视图到对应帧
      if (rows.value && rows.value.length > 0) {
        const index = Math.min(Math.max(0, frame - 1), rows.value.length - 1)
        const row = rows.value[index]
        
        // 提取右臂数据 (real_data_7 到 13)
        // 假设数据已经是弧度制。如果是角度制需要转换。通常机器人日志是弧度。
        const rightAngles = []
        for (let i = 0; i < 7; i++) {
          rightAngles.push(row[`real_data_${i + 7}`] || 0)
        }
        
        updateArmPose(robotJoints.right, rightAngles)
        
        // 渲染
        if (threeRenderer && threeScene && threeCamera) {
          threeRenderer.render(threeScene, threeCamera)
        }
      }
    }

    // 监听数据加载状态，初始化3D场景
    watch([dataLoaded, fileId], ([loaded, newFileId]) => {
      if (loaded && newFileId) {
        nextTick(() => {
          console.log('数据加载完成，初始化3D场景')
          // 初始化3D场景（如果还没初始化）
          if (!threeInitialized.value && threeContainer.value) {
            initThreeScene()
          }
        })
      }
    })

    // 监听播放速度变化
    watch(playbackSpeed, () => {
      if (isPlaying.value) {
        pauseData()
        playData()
      }
    })

    // 监听worldOrientation配置变化，动态更新世界坐标系旋转
    watch(() => hierarchyConfig.value?.worldOrientation, (newOrientation) => {
      if (worldGroup && Array.isArray(newOrientation) && newOrientation.length >= 3) {
        worldGroup.rotation.set(newOrientation[0], newOrientation[1], newOrientation[2])
        console.log('更新世界坐标系旋转:', newOrientation)
        // 重新渲染场景
        if (threeRenderer && threeScene && threeCamera) {
          threeRenderer.render(threeScene, threeCamera)
        }
      }
    }, { deep: true })

    // 监听窗口大小变化
    const handleResize = () => {
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
        batchMode.value = false
        await fetchPreview(1)
        if (onSuccess) onSuccess(data)
      } catch (err) {
        ElMessage.error(t('dataReplay.uploadFailed'))
        if (onError) onError(err)
      }
    }

    // 待上传文件队列
    const pendingFiles = ref([])
    const uploadRef = ref(null)
    let uploadTimer = null // 用于防抖的定时器

    // 上传前检查 - 阻止单个文件自动上传，改为批量上传
    const beforeBatchUpload = (file) => {
      // 检查总文件数（限制为5个）
      const totalFiles = uploadedFiles.value.length + (pendingFiles.value?.length || 0)
      if (totalFiles >= 5) {
        ElMessage.warning('最多只能上传5个文件')
        return false
      }
      
      // 阻止单个文件自动上传，我们会在handleFileChange中批量处理
      return false
    }

    // 文件选择变化处理 - 选择完成后自动批量上传
    const handleFileChange = (file, fileList) => {
      // 检查总文件数（限制为5个）
      const totalFiles = uploadedFiles.value.length + fileList.length
      if (totalFiles > 5) {
        ElMessage.warning('最多只能上传5个文件，已自动移除多余文件')
        // 移除多余的文件
        if (uploadRef.value) {
          uploadRef.value.clearFiles()
          const validFiles = fileList.slice(0, 5 - uploadedFiles.value.length)
          validFiles.forEach(f => {
            uploadRef.value.handleStart(f.raw)
          })
        }
        return
      }
      
      // 更新待上传文件列表
      pendingFiles.value = fileList.map(f => f.raw)
      
      // 清除之前的定时器
      if (uploadTimer) {
        clearTimeout(uploadTimer)
        uploadTimer = null
      }
      
      // 如果文件选择完成且当前没有在上传，延迟一下后自动开始批量上传
      // 延迟是为了确保所有文件都添加到fileList中（防抖处理）
      if (fileList.length > 0 && !uploading.value) {
        uploadTimer = setTimeout(() => {
          // 再次检查，避免重复上传
          if (pendingFiles.value.length > 0 && !uploading.value) {
            const filesToUpload = [...pendingFiles.value]
            pendingFiles.value = [] // 清空待上传列表
            processPendingFiles(filesToUpload)
          }
          uploadTimer = null
        }, 300) // 300ms延迟，等待用户完成文件选择
      }
    }

    // 处理待上传文件队列（改为异步队列处理）
    const processPendingFiles = async (filesToUpload) => {
      if (!filesToUpload || filesToUpload.length === 0) {
        return
      }

      // 如果正在上传，忽略
      if (uploading.value) {
        return
      }

      uploading.value = true
      batchMode.value = true
      uploadProgress.value = 0
      uploadProgressText.value = '准备上传...'

      const totalFiles = filesToUpload.length
      
      try {
        const form = new FormData()
        filesToUpload.forEach(file => {
          form.append('files', file)
        })

        // 先添加到列表，状态为上传中
        const fileItems = filesToUpload.map(file => ({
          id: '',
          filename: file.name,
          size: file.size,
          status: 'uploading'
        }))
        uploadedFiles.value.push(...fileItems)

        // 发送上传请求（现在返回任务ID）
        uploadProgressText.value = `正在创建上传任务...`
        uploadProgress.value = 10
        
        const { data } = await api.motionData.batchUpload(form)
        
        if (data.taskId) {
          // 创建队列任务成功，开始监听任务状态
          const taskId = data.taskId
          activeTasks.value.set(taskId, {
            type: 'upload',
            status: data.status || 'waiting',
            progress: 0,
            result: null,
            error: null,
            fileItems: fileItems
          })
          
          uploadProgressText.value = `任务已创建，等待处理...`
          uploadProgress.value = 20
          
          // 启动轮询（WebSocket 失败时的兜底）
          startTaskPolling(taskId)
        } else {
          // 兼容旧格式（如果没有 taskId，说明后端还没更新）
          if (data.files && data.files.length > 0) {
            data.files.forEach((uploadedFile, index) => {
              if (index < fileItems.length) {
                fileItems[index].id = uploadedFile.id
                fileItems[index].status = 'success'
              }
            })
            uploadProgress.value = 100
            uploadProgressText.value = `成功上传 ${data.files.length} 个文件`
            setTimeout(() => {
              uploadProgress.value = 0
              uploadProgressText.value = ''
            }, 1500)
            ElMessage.success(`成功上传 ${data.files.length} 个文件`)
          } else {
            throw new Error('上传响应格式错误')
          }
        }
      } catch (err) {
        console.error('批量上传失败:', err)
        // 更新失败的文件状态
        const fileItems = uploadedFiles.value.filter(f => f.status === 'uploading' && filesToUpload.some(uploaded => uploaded.name === f.filename))
        fileItems.forEach(item => {
          item.status = 'error'
        })
        uploadProgress.value = 0
        uploadProgressText.value = ''
        const errorMsg = err.response?.data?.message || err.message || '未知错误'
        ElMessage.error(`批量上传失败: ${errorMsg}`)
        uploading.value = false
      } finally {
        // 清空上传组件的文件列表
        if (uploadRef.value) {
          uploadRef.value.clearFiles()
        }
        // 清除定时器
        if (uploadTimer) {
          clearTimeout(uploadTimer)
          uploadTimer = null
        }
      }
    }
    
    // 启动任务状态轮询（兜底机制）
    const startTaskPolling = (taskId) => {
      // 如果已有轮询，先清除
      if (taskPollingIntervals.has(taskId)) {
        clearInterval(taskPollingIntervals.get(taskId))
      }
      
      let pollCount = 0
      const MAX_POLL_COUNT = 300 // 最多轮询300次（10分钟，每2秒一次）
      
      const pollInterval = setInterval(async () => {
        try {
          pollCount++
          
          // 防止无限轮询
          if (pollCount > MAX_POLL_COUNT) {
            console.warn(`任务 ${taskId} 轮询超时，停止轮询`)
            stopTaskPolling(taskId)
            ElMessage.warning('任务处理超时，请刷新页面查看状态')
            return
          }
          
          const { data } = await api.motionData.getTaskStatus(taskId)
          if (data.success && data.data) {
            const taskData = data.data
            updateTaskStatus(taskId, taskData)
            
            // 如果任务已完成或失败，停止轮询
            if (taskData.status === 'completed' || taskData.status === 'failed') {
              stopTaskPolling(taskId)
            }
          }
        } catch (err) {
          console.error(`轮询任务 ${taskId} 状态失败:`, err)
          // 如果任务不存在（404），停止轮询
          if (err.response?.status === 404) {
            console.warn(`任务 ${taskId} 不存在，停止轮询`)
            stopTaskPolling(taskId)
          }
        }
      }, 2000) // 每2秒轮询一次
      
      taskPollingIntervals.set(taskId, pollInterval)
    }
    
    // 停止任务状态轮询
    const stopTaskPolling = (taskId) => {
      if (taskPollingIntervals.has(taskId)) {
        clearInterval(taskPollingIntervals.get(taskId))
        taskPollingIntervals.delete(taskId)
      }
    }
    
    // 更新任务状态
    const updateTaskStatus = (taskId, taskData) => {
      const task = activeTasks.value.get(taskId)
      if (!task) return
      
      task.status = taskData.status
      task.progress = taskData.progress || 0
      task.result = taskData.result || null
      task.error = taskData.error || null
      
      // 根据任务类型更新UI
      if (task.type === 'upload') {
        uploadProgress.value = task.progress
        if (task.status === 'active') {
          uploadProgressText.value = `正在处理文件... (${task.progress}%)`
        } else if (task.status === 'completed') {
          uploadProgress.value = 100
          uploadProgressText.value = '上传完成'
          
          // 更新文件列表（仅更新已存在的文件项，不添加新文件）
          // 注意：刷新页面后 uploadedFiles 为空，这里只更新 task.fileItems，不会添加到 uploadedFiles
          if (task.result && task.result.files) {
            task.result.files.forEach((uploadedFile, index) => {
              if (index < task.fileItems.length) {
                task.fileItems[index].id = uploadedFile.id
                task.fileItems[index].status = 'success'
                
                // 只有当文件已经在 uploadedFiles 中时，才更新状态
                // 刷新页面后 uploadedFiles 为空，所以不会更新
                const existingFile = uploadedFiles.value.find(f => f.filename === task.fileItems[index].filename)
                if (existingFile) {
                  existingFile.id = uploadedFile.id
                  existingFile.status = 'success'
                }
              }
            })
          }
          
          // 如果有错误文件，标记为失败
          if (task.result && task.result.errors) {
            task.result.errors.forEach((error) => {
              const fileItem = task.fileItems.find(f => f.filename === error.filename)
              if (fileItem) {
                fileItem.status = 'error'
              }
              
              // 更新 uploadedFiles 中对应的文件状态
              const existingFile = uploadedFiles.value.find(f => f.filename === error.filename)
              if (existingFile) {
                existingFile.status = 'error'
              }
            })
          }
          
          setTimeout(() => {
            uploadProgress.value = 0
            uploadProgressText.value = ''
            uploading.value = false
          }, 1500)
          
          const successCount = task.result?.files?.length || 0
          const errorCount = task.result?.errors?.length || 0
          if (errorCount > 0) {
            ElMessage.warning(`上传完成: ${successCount} 个成功, ${errorCount} 个失败`)
          } else {
            ElMessage.success(`成功上传 ${successCount} 个文件`)
          }
          
          stopTaskPolling(taskId)
          activeTasks.value.delete(taskId)
        } else if (task.status === 'failed') {
          uploadProgress.value = 0
          uploadProgressText.value = ''
          uploading.value = false
          ElMessage.error(`上传失败: ${task.error || '未知错误'}`)
          
          // 标记所有文件为失败
          task.fileItems.forEach(item => {
            item.status = 'error'
          })
          
          stopTaskPolling(taskId)
          activeTasks.value.delete(taskId)
        }
      } else if (task.type === 'download') {
        processingProgress.value = task.progress
        if (task.status === 'active') {
          processingProgressText.value = `正在处理... (${task.progress}%)`
        } else if (task.status === 'completed') {
          processingProgress.value = 100
          processingProgressText.value = '打包完成，准备下载...'
          
          // 自动下载ZIP文件（仅在页面可见时）
          if (task.result && task.result.downloadUrl) {
            // 检查页面是否可见
            if (document.visibilityState === 'visible') {
              // 页面可见，立即下载
              downloadTaskResultFile(taskId)
            } else {
              // 页面不可见，等待页面可见后再下载
              ElMessage.info('打包完成，页面可见后将自动下载')
              const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                  downloadTaskResultFile(taskId)
                  document.removeEventListener('visibilitychange', handleVisibilityChange)
                }
              }
              document.addEventListener('visibilitychange', handleVisibilityChange)
            }
          }
          
          // 下载完成后，清除文件列表（因为文件是临时文件，下载后应该清空）
          setTimeout(() => {
            processingProgress.value = 0
            processingProgressText.value = ''
            processing.value = false
            // 清除文件列表，用户需要重新上传
            uploadedFiles.value = []
          }, 1500)
          
          ElMessage.success('打包完成')
          stopTaskPolling(taskId)
          activeTasks.value.delete(taskId)
        } else if (task.status === 'failed') {
          processingProgress.value = 0
          processingProgressText.value = ''
          processing.value = false
          ElMessage.error(`打包失败: ${task.error || '未知错误'}`)
          stopTaskPolling(taskId)
          activeTasks.value.delete(taskId)
        }
      }
    }
    
    // 下载任务结果文件
    const downloadTaskResultFile = async (taskId) => {
      try {
        const response = await api.motionData.downloadTaskResult(taskId)
        const blob = new Blob([response.data], { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        
        // 从任务结果获取文件名，或使用默认名称
        const task = activeTasks.value.get(taskId)
        const fileName = task?.result?.zipFileName || `motion_data_batch_${taskId}.zip`
        a.download = fileName
        
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        // 下载成功后，清除文件列表（因为文件是临时文件，下载后应该清空）
        // 延迟清除，确保下载已完成
        setTimeout(() => {
          uploadedFiles.value = []
        }, 500)
      } catch (err) {
        console.error('下载任务结果失败:', err)
        const errorMsg = err.response?.data?.message || err.message || '未知错误'
        ElMessage.error(`下载失败: ${errorMsg}`)
        
        // 如果是因为任务不存在或权限问题，清理任务状态
        if (err.response?.status === 404 || err.response?.status === 403) {
          stopTaskPolling(taskId)
          activeTasks.value.delete(taskId)
        }
      }
    }

    // 批量上传处理 - 阻止单个文件上传，改为批量处理
    const handleBatchUploadRequest = async ({ file, onSuccess, onError }) => {
      // 阻止单个文件上传，我们会在handleFileChange中批量处理
      // 返回false阻止上传
      return false
    }

    // 处理文件数量超限
    const handleExceed = () => {
      ElMessage.warning('最多只能选择5个文件')
    }

    // 批量下载CSV（ZIP格式）- 改为异步队列处理
    const batchDownloadCsv = async () => {
      if (uploadedFiles.value.length === 0) {
        ElMessage.warning('请先上传文件')
        return
      }

      // 只处理成功上传的文件
      const successFiles = uploadedFiles.value.filter(f => f.status === 'success')
      if (successFiles.length === 0) {
        ElMessage.warning('没有可下载的文件')
        return
      }

      processing.value = true
      processingProgress.value = 0
      processingProgressText.value = '正在创建下载任务...'

      try {
        const fileIds = successFiles.map(f => f.id)
        const totalFiles = fileIds.length
        
        // 发送下载请求（现在返回任务ID）
        const { data } = await api.motionData.batchDownloadCsv(fileIds)
        
        if (data.taskId) {
          // 创建队列任务成功，开始监听任务状态
          const taskId = data.taskId
          activeTasks.value.set(taskId, {
            type: 'download',
            status: data.status || 'waiting',
            progress: 0,
            result: null,
            error: null
          })
          
          processingProgressText.value = `任务已创建，等待处理...`
          processingProgress.value = 10
          
          // 启动轮询（WebSocket 失败时的兜底）
          startTaskPolling(taskId)
        } else {
          // 兼容旧格式（如果没有 taskId，说明后端还没更新）
          throw new Error('下载响应格式错误，请更新后端')
        }
      } catch (err) {
        console.error('批量下载失败:', err)
        processingProgress.value = 0
        processingProgressText.value = ''
        processing.value = false
        const errorMsg = err.response?.data?.message || err.message || '未知错误'
        ElMessage.error(`批量下载失败: ${errorMsg}`)
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
      dataLoaded.value = false
      try {
        const offset = (page - 1) * pageSize.value
        const { data } = await api.motionData.preview(fileId.value, { offset, limit: pageSize.value })
        rows.value = data.rows
        totalEntries.value = data.totalEntries
        
        // 数据加载完成后，标记为已加载
        dataLoaded.value = true
        console.log('数据加载完成:', {
          rowsCount: rows.value.length,
          totalEntries: totalEntries.value,
          dataLoaded: dataLoaded.value
        })
        
        // 数据加载完成后，如果当前显示的是第一帧，更新模型初始姿态
        if (rows.value.length > 0) {
          // 默认显示第一行数据对应的姿态
          nextTick(() => {
            seekToFrame(currentFrame.value)
          })
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        dataLoaded.value = false
        ElMessage.error('加载数据失败，请重试')
      }
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

    const fetchDHModel = async () => {
      try {
        const { data } = await api.motionData.getDhModel()
        // 后端返回格式: { dh: { masterArm: [...], toolArm: [...], cameraArm: [...] } }
        if (data && data.dh && data.dh.masterArm) {
          rightArmDH.value = data.dh.masterArm.map(param => ({
            a: param.a,
            alpha: param.alpha,
            d: param.d,
            theta: param.thetaOffset
          }))
          console.log('DH参数加载成功，共', rightArmDH.value.length, '个关节')
        } else {
          console.error('DH参数配置为空，无法初始化机械臂', data)
          ElMessage.error('无法加载DH参数配置，请检查后端配置')
        }
      } catch (error) {
        console.error('获取DH参数失败:', error)
        ElMessage.error('加载DH参数配置失败，请检查网络连接和后端服务')
      }
    }

    // 监听页面刷新/关闭，警告用户
    const handleBeforeUnload = (e) => {
      if (uploading.value || processing.value) {
        e.preventDefault()
        e.returnValue = '正在上传或下载文件，确定要离开吗？'
        return e.returnValue
      }
    }

    // WebSocket 任务状态监听
    const handleMotionDataTaskStatusChange = (data) => {
      const { taskId, status, progress, result, error } = data
      updateTaskStatus(taskId, { status, progress, result, error })
    }
    
    // 恢复任务状态（页面刷新后）
    const restoreTasks = async () => {
      try {
        const { data } = await api.motionData.getUserTasks()
        if (data.success && data.data && Array.isArray(data.data)) {
          const tasks = data.data
          
          // 只恢复活跃的任务（waiting/active），用于显示进度
          // 注意：不恢复已完成的任务，刷新后文件列表清空，用户需要重新上传
          const activeTaskStates = ['waiting', 'active']
          const activeTasksToRestore = tasks.filter(task => 
            activeTaskStates.includes(task.status)
          )
          
          if (activeTasksToRestore.length > 0) {
            console.log(`恢复 ${activeTasksToRestore.length} 个活跃任务`)
            
            activeTasksToRestore.forEach(task => {
              // 根据任务类型恢复
              if (task.type === 'batch-upload') {
                // 恢复上传任务
                const fileItems = task.data?.files?.map(f => ({
                  id: f.id || '',
                  filename: f.originalName || f.filename || '',
                  size: f.size || 0,
                  status: 'uploading' // 恢复时标记为上传中
                })) || []
                
                activeTasks.value.set(task.id, {
                  type: 'upload',
                  status: task.status,
                  progress: task.progress || 0,
                  result: task.result || null,
                  error: task.error || null,
                  fileItems: fileItems
                })
                
                // 恢复进度显示
                if (task.status === 'active') {
                  uploadProgress.value = task.progress || 0
                  uploadProgressText.value = `正在处理文件... (${task.progress || 0}%)`
                  uploading.value = true
                }
                
                // 重新启动轮询
                startTaskPolling(task.id)
              } else if (task.type === 'batch-download') {
                // 只恢复活跃的下载任务（waiting/active），不恢复已完成的任务
                // 因为刷新页面后文件列表已清空，用户需要重新上传才能打包下载
                if (task.status === 'waiting' || task.status === 'active') {
                  // 恢复下载任务
                  activeTasks.value.set(task.id, {
                    type: 'download',
                    status: task.status,
                    progress: task.progress || 0,
                    result: task.result || null,
                    error: task.error || null
                  })
                  
                  // 恢复进度显示
                  if (task.status === 'active') {
                    processingProgress.value = task.progress || 0
                    processingProgressText.value = `正在处理... (${task.progress || 0}%)`
                    processing.value = true
                  }
                  
                  // 重新启动轮询
                  startTaskPolling(task.id)
                }
                // 注意：不恢复已完成的任务，避免刷新后自动下载
              }
            })
          }
          
          // 注意：不恢复已完成的下载任务
          // 因为刷新页面后文件列表已清空，用户需要重新上传才能打包下载
          // 如果恢复已完成的任务并自动下载，会导致重复下载
        }
      } catch (err) {
        console.warn('恢复任务状态失败（已忽略）:', err)
        // 不影响页面正常加载
      }
    }

    onMounted(async () => {
      await fetchConfig()
      await fetchDHModel()
      await loadGeometryConfig()
      await loadHierarchyConfig()
      
      // 连接 WebSocket（如果还没连接）
      if (!websocketClient.isConnected()) {
        websocketClient.connect()
      }
      
      // 监听 MotionData 任务状态变化
      websocketClient.on('motionDataTaskStatusChange', handleMotionDataTaskStatusChange)
      
      // 恢复任务状态（页面刷新后）
      await restoreTasks()
      
      // 不在这里初始化3D场景，等待数据加载完成后再初始化
      // 监听窗口大小变化
      window.addEventListener('resize', handleResize)
      // 监听页面刷新/关闭
      window.addEventListener('beforeunload', handleBeforeUnload)
    })

    onUnmounted(() => {
      // 移除 WebSocket 监听
      websocketClient.off('motionDataTaskStatusChange', handleMotionDataTaskStatusChange)
      
      // 清理所有任务轮询
      taskPollingIntervals.forEach((intervalId) => {
        clearInterval(intervalId)
      })
      taskPollingIntervals.clear()
      
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
        playbackInterval = null
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      if (threeRotationId) {
        cancelAnimationFrame(threeRotationId)
        threeRotationId = null
      }
      
      // 移除事件监听器
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })

    return {
      fileId, fileName, fileSize, totalEntries, currentPage, pageSize, rows, columnsToShow,
      showThreeModel,
      threeContainer, threeInitialized, threeRotationEnabled, dataLoaded,
      currentArmModel, isPlaying, currentFrame, playbackSpeed, tableHeight,
      handleUploadRequest, handleBatchUploadRequest, handleExceed,
      fetchPreview, downloadCsv, batchDownloadCsv, prettySize,
      resetThreeView, toggleThreeRotation, switchArmModel,
      playData, pauseData, stopData, seekToFrame,
      uploadedFiles, uploading, processing, batchMode,
      pendingFiles, uploadRef, processPendingFiles, handleFileChange,
      uploadProgress, uploadProgressText,
      processingProgress, processingProgressText,
      activeTasks
    }
  }
}
</script>

<style scoped>
.data-replay-container {
  height: calc(100vh - 64px);
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.action-section {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.file-info {
  display: flex;
  gap: 16px;
  color: rgb(var(--text-secondary));
}

.info-item {
  font-size: 14px;
}

.progress-section {
  margin-top: 20px;
  margin-bottom: 20px;
  padding: 16px;
  background: rgb(var(--background));
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--border));
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: rgb(var(--text-primary));
  font-size: 14px;
}

.progress-text {
  color: rgb(var(--text-secondary));
  font-size: 13px;
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
  background: rgb(var(--background));
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
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
  color: rgb(var(--text-primary));
  font-size: 16px;
  font-weight: 600;
}

.chart-controls, .three-controls {
  display: flex;
  gap: 8px;
}

.three-chart {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.chart-container {
  flex: 1;
  min-height: 300px;
}

.three-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.three-container {
  flex: 1;
  min-height: 600px;
  position: relative;
  background: linear-gradient(135deg, rgb(var(--background)) 0%, rgb(var(--border)) 100%);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgb(var(--border));
}

.three-placeholder {
  text-align: center;
  color: rgb(var(--text-secondary));
  background: rgba(255, 255, 255, 0.8);
  padding: 20px;
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
}

.three-placeholder p {
  margin: 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.model-info {
  margin-bottom: 16px;
  padding: 16px;
  background: rgb(var(--background));
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--border));
}

.info-card {
  text-align: center;
  padding: 12px;
  background: rgb(var(--background));
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--border));
  height: 100%;
  transition: all 0.3s ease;
}

.info-card.active {
  border-color: rgb(var(--primary));
  background: rgb(var(--primary) / 0.1);
  box-shadow: var(--card-shadow);
}

.info-card h4 {
  margin: 0 0 8px 0;
  color: rgb(var(--text-primary));
  font-size: 14px;
  font-weight: 600;
}

.info-card p {
  margin: 4px 0;
  color: rgb(var(--text-secondary));
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
  color: rgb(var(--text-secondary));
  font-size: 14px;
}

.speed-control {
  min-width: 100px;
}

.debug-info {
  padding: 10px;
  background: rgb(var(--border));
  margin-top: 10px;
  font-size: 12px;
  border-radius: var(--radius-md);
  color: rgb(var(--text-secondary));
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
 
