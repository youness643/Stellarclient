'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const allowedReceiveChannels = new Set([
  'auth:device-code',
  'auth:state',
  'minecraft:state',
  'minecraft:event',
  'mods:event',
  'discord:state',
  'app:fatal-error'
])

contextBridge.exposeInMainWorld('stellar', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getVersions: () => ipcRenderer.invoke('versions:list'),
  getVersionCapabilities: (gameVersion) => ipcRenderer.invoke('versions:capabilities', gameVersion),
  getFabricLoaders: (gameVersion) => ipcRenderer.invoke('fabric:loaders', gameVersion),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getDiscordStatus: () => ipcRenderer.invoke('discord:status'),
  loginDiscord: (settings) => ipcRenderer.invoke('discord:login', settings),
  logoutDiscord: () => ipcRenderer.invoke('discord:logout'),
  inviteDiscordBot: (settings) => ipcRenderer.invoke('discord:invite-bot', settings),
  setDiscordPresence: (enabled) => ipcRenderer.invoke('discord:presence', enabled),
  getClientProfile: () => ipcRenderer.invoke('client:profile'),
  listQuests: () => ipcRenderer.invoke('quests:list'),
  claimQuest: (questId) => ipcRenderer.invoke('quests:claim', questId),
  listStore: () => ipcRenderer.invoke('store:list'),
  purchaseStoreItem: (itemId) => ipcRenderer.invoke('store:purchase', itemId),
  getAdminOverview: () => ipcRenderer.invoke('admin:overview'),
  adminCreateAnnouncement: (body) => ipcRenderer.invoke('admin:announcement', body),
  adminAdjustCoins: (body) => ipcRenderer.invoke('admin:coins', body),
  adminSetPremium: (body) => ipcRenderer.invoke('admin:premium', body),
  adminCreateQuest: (body) => ipcRenderer.invoke('admin:quest', body),
  openStore: (url) => ipcRenderer.invoke('store:open', url),
  discoverJava: (gameVersion) => ipcRenderer.invoke('java:discover', gameVersion),
  browseJava: () => ipcRenderer.invoke('java:browse'),
  browseMinecraftFolder: () => ipcRenderer.invoke('folder:browse-minecraft'),
  openFolder: (kind) => ipcRenderer.invoke('folder:open', kind),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  launchMinecraft: (settings) => ipcRenderer.invoke('minecraft:launch', settings),
  searchMods: (query) => ipcRenderer.invoke('mods:search', query),
  listInstalledMods: (settings) => ipcRenderer.invoke('mods:list-installed', settings),
  installMod: (projectId, requested, settings) => ipcRenderer.invoke('mods:install', projectId, requested, settings),
  uninstallMod: (projectId, settings) => ipcRenderer.invoke('mods:uninstall', projectId, settings),
  toggleMod: (projectId, enabled, settings) => ipcRenderer.invoke('mods:toggle', projectId, enabled, settings),
  installModPreset: (preset, settings) => ipcRenderer.invoke('mods:install-preset', preset, settings),
  auditMods: (settings) => ipcRenderer.invoke('mods:audit', settings),
  repairMods: (settings) => ipcRenderer.invoke('mods:repair', settings),
  listFriends: () => ipcRenderer.invoke('social:list'),
  addFriend: (name) => ipcRenderer.invoke('social:add', name),
  removeFriend: (id) => ipcRenderer.invoke('social:remove', id),
  listAnnouncements: () => ipcRenderer.invoke('announcements:list'),
  on: (channel, callback) => {
    if (!allowedReceiveChannels.has(channel) || typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
