<template>
  <div class="devices-container">
    <div class="action-bar">
      <div class="search-section">
        <el-input v-model="search" placeholder="搜索设备（编号/型号/密钥/医院）..." style="width: 300px" clearable @keyup.enter="loadDevices" />
        <el-button @click="loadDevices">查询</el-button>
      </div>
      <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:create')">
        <el-button type="primary" @click="openEdit()">新增设备</el-button>
      </div>
    </div>

    <el-card class="list-card">
      <el-table :data="devices" :loading="loading" style="width: 100%">
        <el-table-column prop="device_id" label="设备编号" width="160" />
        <el-table-column prop="device_model" label="设备型号" width="160" />
        <el-table-column prop="device_key" label="设备密钥(MAC)" width="200" />
        <el-table-column prop="hospital" label="所属医院" />
        <el-table-column label="操作" width="200" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)" v-if="$store.getters['auth/hasPermission']('device:update')">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)" v-if="$store.getters['auth/hasPermission']('device:delete')">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          :current-page="page"
          :page-size="limit"
          :total="total"
          :page-sizes="[10,20,50,100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="(p)=>{page=p;loadDevices()}"
          @size-change="(s)=>{limit=s;page=1;loadDevices()}"
        />
      </div>
    </el-card>

    <el-dialog v-model="showEdit" :title="editing ? '编辑设备' : '新增设备'" width="520px">
      <el-form :model="form" label-width="110px" :rules="rules" ref="formRef">
        <el-form-item label="设备编号" prop="device_id">
          <el-input v-model="form.device_id" :disabled="!!editing" placeholder="如 4371-01 / ABC-12" />
        </el-form-item>
        <el-form-item label="设备型号" prop="device_model">
          <el-input v-model="form.device_model" />
        </el-form-item>
        <el-form-item label="设备密钥(MAC)" prop="device_key">
          <el-input v-model="form.device_key" placeholder="00-01-05-77-6a-09" />
        </el-form-item>
        <el-form-item label="所属医院" prop="hospital">
          <el-input v-model="form.hospital" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
  
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import { useStore } from 'vuex'

export default {
  name: 'Devices',
  setup() {
    const store = useStore()
    const canEdit = computed(() => {
      return store.getters['auth/hasPermission']('device:update')
    })

    const loading = ref(false)
    const saving = ref(false)
    const devices = ref([])
    const total = ref(0)
    const page = ref(1)
    const limit = ref(20)
    const search = ref('')

    const showEdit = ref(false)
    const editing = ref(null)
    const formRef = ref(null)
    const form = reactive({ device_id: '', device_model: '', device_key: '', hospital: '' })

    const rules = {
      device_id: [
        { required: true, message: '请输入设备编号', trigger: 'blur' },
        { pattern: /^[0-9A-Za-z]+-[0-9A-Za-z]+$/, message: '格式如 4371-01 / ABC-12', trigger: 'blur' }
      ],
      device_key: [
        { pattern: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, message: '请输入MAC地址格式', trigger: 'blur' }
      ]
    }

    const loadDevices = async () => {
      loading.value = true
      try {
        const res = await api.devices.getList({ page: page.value, limit: limit.value, search: search.value })
        devices.value = res.data.devices || []
        total.value = res.data.total || 0
      } catch {
        ElMessage.error('加载设备失败')
      } finally {
        loading.value = false
      }
    }

    const openEdit = (row) => {
      if (row) {
        editing.value = row
        Object.assign(form, { device_id: row.device_id, device_model: row.device_model, device_key: row.device_key, hospital: row.hospital })
      } else {
        editing.value = null
        Object.assign(form, { device_id: '', device_model: '', device_key: '', hospital: '' })
      }
      showEdit.value = true
    }

    const save = async () => {
      await formRef.value?.validate()
      saving.value = true
      try {
        if (editing.value) {
          await api.devices.update(editing.value.id, form)
          ElMessage.success('更新成功')
        } else {
          await api.devices.create(form)
          ElMessage.success('创建成功')
        }
        showEdit.value = false
        await loadDevices()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    const onDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定删除该设备？', '提示', { type: 'warning' })
        await api.devices.delete(row.id)
        ElMessage.success('删除成功')
        loadDevices()
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
      }
    }

    onMounted(loadDevices)

    return { devices, total, page, limit, search, loading, saving, showEdit, editing, form, rules, formRef, canEdit, loadDevices, openEdit, save, onDelete }
  }
}
</script>

<style scoped>
.devices-container { height: 100%; }
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.action-section { display: flex; gap: 10px; }
.list-card { margin-bottom: 20px; }
.pagination-wrapper { display: flex; justify-content: center; margin-top: 20px; }
</style>


