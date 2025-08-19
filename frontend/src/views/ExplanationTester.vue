<template>
  <div>
    <a-page-header title="释义测试工具" sub-title="仅管理员可用" />
    <a-card style="margin-top: 16px">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="故障码 (code)">
              <a-input v-model:value="form.code" placeholder="可填日志中的完整故障码如 1010A，或 0X010A" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="子系统 (可选)">
              <a-input v-model:value="form.subsystem" placeholder="如 1-9 或 A" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="自定义模板 (可选，优先使用)">
              <a-input v-model:value="form.template" placeholder="如: 轴{0:d} 错误码 {1:x}" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="参数1">
              <a-input v-model:value="form.param1" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数2">
              <a-input v-model:value="form.param2" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数3">
              <a-input v-model:value="form.param3" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数4">
              <a-input v-model:value="form.param4" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-space>
          <a-button type="primary" :loading="loading" @click="handleParse">解析</a-button>
          <a-button @click="handleReset">重置</a-button>
        </a-space>
      </a-form>
    </a-card>

    <a-card style="margin-top: 16px" v-if="result">
      <a-descriptions bordered title="解析结果" :column="1">
        <a-descriptions-item label="子系统">{{ result.subsystem }}</a-descriptions-item>
        <a-descriptions-item label="臂号">{{ result.arm }}</a-descriptions-item>
        <a-descriptions-item label="关节号">{{ result.joint }}</a-descriptions-item>
        <a-descriptions-item label="模板">{{ result.template }}</a-descriptions-item>
        <a-descriptions-item label="参数">{{ JSON.stringify(result.params) }}</a-descriptions-item>
        <a-descriptions-item label="释义">{{ result.explanation }}</a-descriptions-item>
      </a-descriptions>
    </a-card>
  </div>
  
</template>

<script>
import { reactive, ref } from 'vue'
import api from '../api'
import { message } from 'ant-design-vue'

export default {
  name: 'ExplanationTester',
  setup() {
    const form = reactive({
      code: '',
      subsystem: '',
      template: '',
      param1: '',
      param2: '',
      param3: '',
      param4: ''
    })
    const loading = ref(false)
    const result = ref(null)

    const handleParse = async () => {
      if (!form.code) {
        message.warning('请填写故障码 code')
        return
      }
      loading.value = true
      try {
        const payload = {
          code: form.code,
          param1: form.param1,
          param2: form.param2,
          param3: form.param3,
          param4: form.param4
        }
        if (form.subsystem) payload.subsystem = form.subsystem
        if (form.template) payload.template = form.template
        const resp = await api.explanations.preview(payload)
        result.value = resp.data
      } catch (e) {
        result.value = null
      } finally {
        loading.value = false
      }
    }

    const handleReset = () => {
      form.code = ''
      form.subsystem = ''
      form.template = ''
      form.param1 = ''
      form.param2 = ''
      form.param3 = ''
      form.param4 = ''
      result.value = null
    }

    return { form, loading, result, handleParse, handleReset }
  }
}
</script>

<style scoped>
</style>


