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
      onLogout
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: var(--m-color-bg);
  padding: calc(var(--m-space-4) + env(safe-area-inset-top, 0px)) 0 var(--m-space-6);
  box-sizing: border-box;
}

.page-header {
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  padding: 0 var(--m-space-4) var(--m-space-4);
  font-size: var(--m-font-size-lg);
  font-weight: var(--m-font-weight-medium);
  color: var(--m-color-text);
  background-color: var(--m-color-bg);
  z-index: 1;
}

.content {
  padding: 0 var(--m-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--m-space-4);
}

.profile-card {
  background: var(--m-color-surface);
  border-radius: var(--m-radius-lg);
  border: 1px solid var(--m-color-border);
  padding: var(--m-space-4);
  box-shadow: var(--m-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--m-space-4);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
}

.avatar-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: var(--m-color-text);
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
  color: var(--m-color-surface);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-1);
}

.profile-name {
  font-size: var(--m-font-size-xl);
  font-weight: var(--m-font-weight-semibold);
  color: var(--m-color-text);
  line-height: var(--m-line-height-md);
}

.profile-username {
  font-size: var(--m-font-size-md);
  color: var(--m-color-text-secondary);
}

.profile-divider {
  height: 1px;
  background-color: var(--m-color-border);
}

.profile-details {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--m-font-size-md);
  color: var(--m-color-text-secondary);
}

.detail-label {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
}

.detail-icon {
  font-size: var(--m-font-size-lg);
  color: var(--m-color-text-tertiary);
}

.detail-value {
  color: var(--m-color-text);
  font-weight: var(--m-font-weight-medium);
}

.detail-badge {
  padding: var(--m-space-1) var(--m-space-3);
  border-radius: var(--m-radius-sm);
  border: 1px solid var(--m-color-border);
  background-color: var(--m-color-surface-soft);
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text);
}

.logout-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--m-space-2);
  width: 100%;
  padding: var(--m-space-3);
  border-radius: var(--m-radius-sm);
  border: 1px solid var(--m-color-danger-bg);
  background-color: var(--m-color-surface);
  color: var(--m-color-danger-text);
  font-size: var(--m-font-size-md);
  font-weight: var(--m-font-weight-medium);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.logout-button:active {
  background-color: var(--m-color-danger-bg);
  transform: scale(0.99);
}

.logout-icon {
  font-size: var(--m-font-size-lg);
  color: inherit;
}
</style>
