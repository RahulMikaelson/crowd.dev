<template>
  <lf-dropdown-item @click="isJiraSettingsDrawerVisible = true">
    <lf-icon name="sliders-simple" type="regular" />
    Settings
  </lf-dropdown-item>
  <lf-jira-settings-drawer
    v-if="isJiraSettingsDrawerVisible"
    v-model="isJiraSettingsDrawerVisible"
    :integration="props.integration"
    :segment-id="props.segmentId"
    :grandparent-id="props.grandparentId"
  />
</template>

<script setup lang="ts">
import { defineProps, ref } from 'vue';
import LfDropdownItem from '@/ui-kit/dropdown/DropdownItem.vue';
import LfIcon from '@/ui-kit/icon/Icon.vue';
import LfJiraSettingsDrawer from '@/config/integrations/jira/components/jira-settings-drawer.vue';

const props = defineProps<{
  integration: any,
  segmentId: string | null;
  grandparentId: string | null;
}>();

const isJiraSettingsDrawerVisible = ref(false);
</script>

<script lang="ts">
export default {
  name: 'LfGitDropdown',
};
</script>
