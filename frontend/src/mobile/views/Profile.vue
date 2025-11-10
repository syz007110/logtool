<template>
  <div class="page">
    <div class="page-header">
      {{ $t('mobile.profile.headerTitle') }}
    </div>

    <div class="content">
      <section class="profile-card">
        <div class="profile-header">
          <div class="avatar-wrapper">
            <img
              v-if="avatarUrl"
              :src="avatarUrl"
              :alt="$t('mobile.profile.avatarAltFallback')"
              class="avatar-image"
            >
            <div v-else class="avatar-placeholder">
              <van-icon name="user-circle-o" />
            </div>
          </div>

          <div class="profile-info">
            <div class="profile-name">{{ displayName }}</div>
            <div class="profile-username">{{ usernameDisplay }}</div>
          </div>
        </div>

        <div class="profile-divider" />

        <div class="profile-details">
          <div class="detail-row">
            <div class="detail-label">
              <van-icon name="manager-o" class="detail-icon" />
              <span>{{ $t('mobile.profile.userIdLabel') }}</span>
            </div>
            <span class="detail-value">{{ idDisplay }}</span>
          </div>
          <div class="detail-row">
            <div class="detail-label">
              <van-icon name="shield-o" class="detail-icon" />
              <span>{{ $t('mobile.profile.roleLabel') }}</span>
            </div>
            <div class="detail-badge">{{ roleDisplay }}</div>
          </div>
        </div>
      </section>

      <section class="permissions-card">
        <div class="section-title">{{ $t('mobile.profile.permissionsTitle') }}</div>
        <div v-if="permissionsDisplay.length" class="permission-list">
          <span
            v-for="permission in permissionsDisplay"
            :key="permission"
            class="permission-pill"
          >
            {{ permission }}
          </span>
        </div>
        <div v-else class="permission-empty">
          {{ $t('mobile.profile.permissionsEmpty') }}
        </div>
      </section>

      <button class="logout-button" type="button" @click="onLogout">
        <van-icon name="log-out" class="logout-icon" />
        <span>{{ $t('mobile.profile.logout') }}</span>
      </button>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { Icon as VanIcon } from 'vant'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'

export default {
  name: 'MProfile',
  components: {
    'van-icon': VanIcon
  },
  setup() {
    const store = useStore()
    const { t } = useI18n()

    const currentUser = computed(() => store.getters['auth/currentUser'] || {})
    const normalizedRole = computed(() => store.getters['auth/userRole'])

    const roleDisplay = computed(() => {
      const roleKey = normalizedRole.value
      const ROLE_LABEL_MAP = {
        admin: t('mobile.profile.roles.admin'),
        expert: t('mobile.profile.roles.expert'),
        user: t('mobile.profile.roles.user')
      }
      if (roleKey && ROLE_LABEL_MAP[roleKey]) {
        return ROLE_LABEL_MAP[roleKey]
      }
      const rawRole =
        currentUser.value?.role_name ||
        currentUser.value?.role ||
        currentUser.value?.roleLabel
      return rawRole || t('mobile.profile.roleFallback')
    })

    const displayName = computed(() => {
      const { name, nickname, username, email } = currentUser.value
      return name || nickname || username || email || t('mobile.profile.nameFallback')
    })

    const usernameDisplay = computed(() => {
      const username = currentUser.value?.username || currentUser.value?.account || currentUser.value?.email
      if (!username) return t('mobile.profile.usernameFallback')
      return username.startsWith('@') ? username : `@${username}`
    })

    const idDisplay = computed(() => {
      const id = currentUser.value?.id ?? currentUser.value?.user_id ?? currentUser.value?.uid
      if (id === undefined || id === null || id === '') {
        return '--'
      }
      return id
    })

    const avatarUrl = computed(() => {
      return (
        currentUser.value?.avatar ||
        currentUser.value?.avatar_url ||
        currentUser.value?.profileImage ||
        currentUser.value?.profile_pic ||
        ''
      )
    })

    const formatPermissionGroup = (permission) => {
      if (!permission) return ''
      if (typeof permission === 'object') {
        const groupLike =
          permission.groupLabel ||
          permission.group ||
          permission.category ||
          permission.module ||
          permission.parentLabel
        if (groupLike) {
          const nested = formatPermissionGroup(groupLike)
          if (nested) return nested
        }
        return (
          permission.label ||
          permission.name ||
          permission.title ||
          formatPermissionGroup(permission.code)
        )
      }
      const text = String(permission).trim()
      if (!text) return ''
      const normalized = text.toLowerCase()

      const segments = normalized.split(':')
      const groupKey = segments[0] || ''

      if (!groupKey || groupKey === normalized) {
        const aliasLabel = getGroupAliasLabel(normalized)
        if (aliasLabel) return aliasLabel
        return text
      }

      const groupLabelKey = `roles.permissionGroups.${groupKey}`
      const groupLabelValue = t(groupLabelKey)
      if (groupLabelValue && groupLabelValue !== groupLabelKey) {
        return groupLabelValue
      }

      const aliasLabel = getGroupAliasLabel(groupKey)
      if (aliasLabel) return aliasLabel

      return groupKey.toUpperCase()
    }

    const permissionsDisplay = computed(() => {
      const permissions = currentUser.value?.permissions
      let normalizedList = []

      if (Array.isArray(permissions)) {
        normalizedList = permissions
      } else if (typeof permissions === 'string') {
        normalizedList = permissions
          .split(/[,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      }

      const formattedGroups = normalizedList
        .map((permission) => formatPermissionGroup(permission))
        .filter(Boolean)

      return Array.from(new Set(formattedGroups))
    })

    const getGroupAliasLabel = (source) => {
      if (!source) return ''
      const normalized = source.toLowerCase()
      const aliasMappings = [
        { regex: /(fault|error|code)/, group: 'error_code' },
        { regex: /(log|journal)/, group: 'log' },
        { regex: /(surgery|operation)/, group: 'surgery' },
        { regex: /(system|setting|config)/, group: 'system' },
        { regex: /(device|equipment)/, group: 'device' },
        { regex: /(data[_-]?replay|replay)/, group: 'data_replay' }
      ]
      const matched = aliasMappings.find(item => item.regex.test(normalized))
      if (!matched) return ''
      const labelKey = `roles.permissionGroups.${matched.group}`
      const labelValue = t(labelKey)
      return labelValue && labelValue !== labelKey ? labelValue : ''
    }

    const onLogout = () => {
      try {
        store.dispatch('auth/logout')
      } catch (_) {
        // ignore
      }
      window.location.href = '/m/login'
    }

    return {
      avatarUrl,
      displayName,
      usernameDisplay,
      idDisplay,
      roleDisplay,
      permissionsDisplay,
      onLogout
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 0 24px;
  box-sizing: border-box;
}

.page-header {
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  padding: 0 16px 16px;
  font-size: 16px;
  font-weight: 500;
  color: #101828;
  background-color: #f5f7fa;
  z-index: 1;
}

.content {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-card,
.permissions-card {
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  padding: 16px;
  box-shadow: 0 2px 8px rgba(16, 24, 40, 0.04);
}

.profile-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: #101828;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder .van-icon {
  font-size: 32px;
  color: #ffffff;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 18px;
  font-weight: 600;
  color: #101828;
  line-height: 1.4;
}

.profile-username {
  font-size: 14px;
  color: #6a7282;
}

.profile-divider {
  height: 1px;
  background-color: #edf0f3;
}

.profile-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #4a5565;
}

.detail-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-icon {
  font-size: 16px;
  color: #98a2b3;
}

.detail-value {
  color: #101828;
  font-weight: 500;
}

.detail-badge {
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background-color: #f7f8fa;
  font-size: 12px;
  color: #101828;
}

.permissions-card {
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #364153;
  margin-bottom: 12px;
}

.permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.permission-pill {
  padding: 4px 12px;
  border-radius: 8px;
  background-color: #eceef2;
  font-size: 12px;
  color: #030213;
}

.permission-empty {
  font-size: 12px;
  color: #98a2b3;
}

.logout-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ffc9c9;
  background-color: #ffffff;
  color: #e7000b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.logout-button:active {
  background-color: #fff5f5;
  transform: scale(0.99);
}

.logout-icon {
  font-size: 16px;
  color: inherit;
}
</style>