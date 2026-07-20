'use strict'

const state = {
  appInfo: null,
  settings: null,
  versions: [],
  fabricLoaders: [],
  capability: null,
  mods: { query: '', index: 'relevance', offset: 0, limit: 18, total: 0, hits: [], loading: false },
  installed: [],
  friends: [],
  announcements: [],
  logs: [],
  launching: false,
  verificationUrl: 'https://www.microsoft.com/link',
  discord: { connected: false, account: null, loading: false },
  clientProfile: null,
  quests: [],
  storeItems: [],
  admin: null
}

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

function escapeText (value) { return String(value ?? '') }
function formatNumber (value) { return new Intl.NumberFormat('it-IT', { notation: Number(value) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0) }
function formatDate (value) {
  try { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) } catch { return 'Data non disponibile' }
}
function truncateMiddle (value, max = 40) {
  const text = String(value || '')
  if (text.length <= max) return text
  const left = Math.ceil((max - 1) / 2)
  return `${text.slice(0, left)}…${text.slice(-(max - left - 1))}`
}
function icon (id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `icons.svg#${id}`)
  svg.appendChild(use)
  return svg
}
function setHidden (node, hidden) { if (node) node.classList.toggle('hidden', Boolean(hidden)) }
function toast (message, kind = 'info') {
  const node = document.createElement('div')
  node.className = `toast ${kind}`
  node.textContent = String(message)
  $('#toastHost').appendChild(node)
  setTimeout(() => node.remove(), 4300)
}
function appendLog (message, kind = 'info') {
  const clean = String(message ?? '').replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!clean) return
  const time = new Date().toLocaleTimeString('it-IT', { hour12: false })
  for (const row of clean.split(/\r?\n/).filter(Boolean)) state.logs.push({ time, message: row.slice(0, 3000), kind })
  if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800)
  renderLogs()
}
function renderLogs () {
  const out = $('#logOutput')
  if (!out) return
  if (!state.logs.length) {
    out.textContent = '[STELLAR] Launcher pronto.\n'
    return
  }
  out.replaceChildren()
  const fragment = document.createDocumentFragment()
  for (const entry of state.logs) {
    const line = document.createElement('span')
    line.className = `log-${entry.kind}`
    line.textContent = `[${entry.time}] ${entry.message}\n`
    fragment.appendChild(line)
  }
  out.appendChild(fragment)
  out.scrollTop = out.scrollHeight
  $('#consoleTime').textContent = `${state.logs.length} righe`
}
function setProgress (percent, message) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0))
  $('#progressBar').style.width = `${safe}%`
  $('#statusPercent').textContent = `${Math.round(safe)}%`
  if (message) $('#statusText').textContent = String(message)
}
function settingsOverrides () {
  return {
    selectedVersion: $('#homeVersionSelect').value || state.settings.selectedVersion,
    versionType: state.versions.find(v => v.id === $('#homeVersionSelect').value)?.type || 'release',
    loader: $('#homeLoaderSelect').value || 'fabric',
    loaderVersion: $('#loaderVersion').value || 'latest',
    separateInstances: $('#separateInstances').checked,
    memoryMinGb: Number($('#memoryMin').value || 2),
    memoryMaxGb: Number($('#memoryMax').value || state.settings?.memoryMaxGb || 6),
    javaPath: $('#javaPath').value.trim(),
    minecraftRoot: $('#minecraftRoot').value.trim(),
    serverAddress: $('#serverAddress').value.trim(),
    closeLauncherOnGameStart: $('#closeOnStart').checked,
    uiScale: Number($('#uiScale').value || 100),
    reduceMotion: $('#reduceMotion').checked,
    fullscreen: $('#fullscreen').checked,
    announcementsUrl: $('#announcementsUrl').value.trim(),
    friendsServiceUrl: $('#friendsServiceUrl').value.trim(),
    storeUrl: $('#storeUrl').value.trim(),
    coreCatalogUrl: $('#coreCatalogUrl').value.trim(),
    autoInstallCore: $('#autoInstallCore').checked,
    protectVanillaResources: $('#protectVanillaResources').checked,
    theme: $('#themeSelect').value || 'aurora',
    microsoftClientId: $('#microsoftClientId').value.trim(),
    discordClientId: $('#discordClientId').value.trim(),
    discordRedirectUri: $('#discordRedirectUri').value.trim(),
    discordBotPermissions: $('#discordBotPermissions').value.trim() || '0',
    discordGuildId: $('#discordGuildId').value.trim(),
    discordPresenceEnabled: $('#discordPresenceEnabled').checked
  }
}
function activeProfileLabel () {
  const version = $('#homeVersionSelect').value || state.settings?.selectedVersion || '—'
  const loader = ($('#homeLoaderSelect').value || state.settings?.loader || 'fabric') === 'fabric' ? 'Fabric' : 'Vanilla'
  return `${loader} • ${version}`
}
function updateAccountUi () {
  const account = state.settings?.account
  const avatar = $('#accountAvatar')
  if (account?.name) {
    $('#accountName').textContent = account.name
    $('#accountStatus').textContent = 'Minecraft Java'
    $('#accountPill').textContent = 'CONNESSO'
    $('#accountPill').className = 'status-pill online'
    $('#playSubtitle').textContent = `${account.name} • ${activeProfileLabel()}`
    avatar.textContent = account.name[0].toUpperCase()
    avatar.style.backgroundImage = account.id ? `url("https://mc-heads.net/avatar/${encodeURIComponent(account.id)}/80")` : ''
  } else {
    $('#accountName').textContent = 'Non connesso'
    $('#accountStatus').textContent = 'Account Microsoft'
    $('#accountPill').textContent = 'OFFLINE'
    $('#accountPill').className = 'status-pill muted'
    $('#playSubtitle').textContent = 'Accedi con Microsoft per giocare'
    avatar.textContent = '?'
    avatar.style.backgroundImage = ''
  }
  $('#instanceSummary').textContent = activeProfileLabel()
}
function updateMemorySlider () {
  const slider = $('#memoryMax')
  if (!slider) return
  const min = Number(slider.min || 2)
  const max = Number(slider.max || 16)
  const value = Number(slider.value || 6)
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0
  slider.style.setProperty('--ram-progress', `${progress}%`)
  const output = $('#memoryMaxValue')
  if (output) output.textContent = `${value} GB`
}

function applyUiPreferences () {
  const scale = Number(state.settings?.uiScale || 100)
  document.documentElement.style.setProperty('--ui-scale', String(scale / 100))
  document.documentElement.dataset.theme = state.settings?.theme || 'aurora'
  document.body.classList.toggle('reduce-motion', Boolean(state.settings?.reduceMotion))
  $('#uiScaleValue').textContent = `${scale}%`
}
function populateVersionSelects () {
  const selected = state.settings?.selectedVersion || '1.21.8'
  const home = $('#homeVersionSelect')
  const settings = $('#settingsVersion')
  for (const select of [home, settings]) {
    select.replaceChildren()
    const list = state.versions.length ? state.versions : [{ id: selected, type: 'release' }]
    for (const version of list) {
      const option = document.createElement('option')
      option.value = version.id
      option.textContent = `${version.id}${version.legacyVanilla ? ' — Vanilla' : ''}`
      option.selected = version.id === selected
      select.appendChild(option)
    }
  }
}
function renderCompatibilityNote (node, mode, title, message) {
  if (!node) return
  node.classList.remove('checking', 'supported', 'fallback', 'unknown')
  node.classList.add(mode)
  const strong = node.querySelector('strong')
  const small = node.querySelector('small')
  if (strong) strong.textContent = title
  if (small) small.textContent = message
}

function setModrinthAvailability (available) {
  for (const selector of ['.mods-toolbar', '.preset-row', '#modBrowse', '#modInstalled']) {
    const node = $(selector)
    if (node) node.classList.toggle('is-disabled', !available)
  }
  for (const id of ['searchModsButton', 'modSearch', 'modSort', 'loadMoreMods', 'auditMods', 'repairMods']) {
    const node = $(`#${id}`)
    if (node) node.disabled = !available
  }
}

async function refreshVersionCapability ({ autoFallback = true, save = true } = {}) {
  const version = $('#homeVersionSelect').value || state.settings?.selectedVersion || '1.21.8'
  renderCompatibilityNote($('#profileCompatibility'), 'checking', 'Verifica compatibilità…', `Controllo Minecraft ${version} e Fabric.`)
  renderCompatibilityNote($('#modCompatibilityNotice'), 'checking', 'Controllo profilo Modrinth…', 'Verifica loader e versione in corso.')
  const result = await window.stellar.getVersionCapabilities(version)
  state.capability = result
  const fabricOptions = [$('#homeLoaderSelect'), $('#settingsLoader')]
    .map(select => select && select.querySelector('option[value="fabric"]'))
    .filter(Boolean)
  for (const option of fabricOptions) option.disabled = result.fabric === false

  if (!result.ok) {
    renderCompatibilityNote($('#profileCompatibility'), 'unknown', 'Compatibilità non verificata', result.error || 'Minecraft Vanilla resta disponibile.')
    renderCompatibilityNote($('#modCompatibilityNotice'), 'unknown', 'Modrinth temporaneamente non disponibile', 'Riprova quando la connessione è disponibile.')
    setModrinthAvailability(false)
    return result
  }

  if (result.fabric === false) {
    if (autoFallback && ($('#homeLoaderSelect').value === 'fabric' || $('#settingsLoader').value === 'fabric')) {
      $('#homeLoaderSelect').value = 'vanilla'
      $('#settingsLoader').value = 'vanilla'
      if (save) state.settings = await window.stellar.saveSettings({ selectedVersion: version, loader: 'vanilla', loaderVersion: 'latest' })
      toast(`Minecraft ${version}: Fabric non disponibile, profilo impostato su Vanilla.`, 'info')
    }
    renderCompatibilityNote($('#profileCompatibility'), 'fallback', `Vanilla ${version}`, result.message || 'Avvio con menu e multiplayer Minecraft predefiniti.')
    renderCompatibilityNote($('#modCompatibilityNotice'), 'fallback', 'Mod disattivate per questo profilo', 'Fabric e Modrinth non sono disponibili; la versione resta avviabile in Vanilla.')
    setModrinthAvailability(false)
  } else if (result.fabric === true) {
    renderCompatibilityNote($('#profileCompatibility'), 'supported', `Fabric disponibile per ${version}`, result.message || 'Modrinth e profili separati sono disponibili.')
    renderCompatibilityNote($('#modCompatibilityNotice'), 'supported', 'Modrinth compatibile', `Saranno mostrate solo mod Fabric dichiarate compatibili con Minecraft ${version}.`)
    setModrinthAvailability($('#homeLoaderSelect').value === 'fabric')
  } else {
    renderCompatibilityNote($('#profileCompatibility'), 'unknown', 'Fabric non verificabile', result.message || 'Puoi comunque usare Vanilla.')
    renderCompatibilityNote($('#modCompatibilityNotice'), 'unknown', 'Modrinth in attesa', 'La compatibilità esatta richiede una connessione a Fabric Meta e Modrinth.')
    setModrinthAvailability(false)
  }
  updateAccountUi()
  return result
}

async function loadFabricLoaders () {
  const select = $('#loaderVersion')
  select.replaceChildren()
  const latest = document.createElement('option')
  latest.value = 'latest'
  latest.textContent = 'Latest stable'
  select.appendChild(latest)
  if (($('#homeLoaderSelect').value || state.settings.loader) !== 'fabric' || state.capability?.fabric !== true) {
    select.disabled = true
    return
  }
  select.disabled = false
  const gameVersion = $('#homeVersionSelect').value || state.settings.selectedVersion
  const loaders = Array.isArray(state.capability?.loaders) && state.capability.version === gameVersion
    ? state.capability.loaders
    : (await window.stellar.getFabricLoaders(gameVersion)).loaders || []
  state.fabricLoaders = loaders
  for (const loader of state.fabricLoaders.slice(0, 30)) {
    const option = document.createElement('option')
    option.value = loader.version
    option.textContent = `${loader.version}${loader.stable ? ' • stable' : ''}`
    select.appendChild(option)
  }
  select.value = state.settings.loaderVersion || 'latest'
  if (!select.value) select.value = 'latest'
}

function applySettingsToUi () {
  const s = state.settings
  if (!s) return
  populateVersionSelects()
  $('#homeLoaderSelect').value = s.loader
  $('#settingsLoader').value = s.loader
  $('#separateInstances').checked = s.separateInstances !== false
  $('#memoryMin').value = s.memoryMinGb
  $('#memoryMax').value = s.memoryMaxGb
  $('#memoryMaxValue').textContent = `${s.memoryMaxGb} GB`
  updateMemorySlider()
  $('#javaPath').value = s.javaPath || ''
  $('#minecraftRoot').value = s.minecraftRoot || ''
  $('#serverAddress').value = s.serverAddress || ''
  $('#closeOnStart').checked = Boolean(s.closeLauncherOnGameStart)
  $('#uiScale').value = s.uiScale || 100
  $('#reduceMotion').checked = Boolean(s.reduceMotion)
  $('#fullscreen').checked = Boolean(s.fullscreen)
  $('#announcementsUrl').value = s.announcementsUrl || ''
  $('#friendsServiceUrl').value = s.friendsServiceUrl || ''
  $('#storeUrl').value = s.storeUrl || 'https://stellarclient.it/store'
  $('#coreCatalogUrl').value = s.coreCatalogUrl || ''
  $('#autoInstallCore').checked = s.autoInstallCore !== false
  $('#protectVanillaResources').checked = s.protectVanillaResources !== false
  $('#themeSelect').value = s.theme || 'aurora'
  $('#microsoftClientId').value = s.microsoftClientId || ''
  $('#discordClientId').value = s.discordClientId || ''
  $('#discordRedirectUri').value = s.discordRedirectUri || 'http://127.0.0.1:8787/auth/discord/callback'
  $('#discordBotPermissions').value = s.discordBotPermissions || '0'
  $('#discordGuildId').value = s.discordGuildId || ''
  $('#discordPresenceEnabled').checked = s.discordPresenceEnabled !== false
  $('#discordPresenceQuick').checked = s.discordPresenceEnabled !== false
  $('#discordCallbackInfo').textContent = s.discordRedirectUri || 'http://127.0.0.1:8787/auth/discord/callback'
  applyUiPreferences()
  updateAccountUi()
  updateDiscordUi()
}

function updateClientProfileUi () {
  const profile = state.clientProfile
  const coins = profile ? formatNumber(profile.coins) : '—'
  const premium = profile?.premium ? 'PREMIUM' : 'FREE'
  const discordName = profile?.discord?.globalName || profile?.discord?.username || 'NON COLLEGATO'
  $('#sidebarCoins').textContent = coins
  $('#sidebarPremium').textContent = premium
  $('#storeCoins').textContent = coins
  $('#questCoins').textContent = coins
  $('#questPremium').textContent = premium
  $('#questDiscord').textContent = discordName.toUpperCase()
  setHidden($('#adminNav'), !profile?.isAdmin)
  if (!profile?.isAdmin && $('#page-admin')?.classList.contains('active')) openPage('home')
  if (state.settings?.discordAccount) {
    state.settings.discordAccount.guildMember = Boolean(profile?.guildMember)
    state.settings.discordAccount.isAdmin = Boolean(profile?.isAdmin)
  }
}

async function loadClientProfile () {
  const result = await window.stellar.getClientProfile()
  if (!result.ok) {
    state.clientProfile = null
    updateClientProfileUi()
    return null
  }
  state.clientProfile = result.profile || null
  updateClientProfileUi()
  return state.clientProfile
}

function renderQuests () {
  const root = $('#questList')
  root.replaceChildren()
  if (!state.quests.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Nessuna quest disponibile oppure Discord non è collegato.'
    root.appendChild(empty)
    return
  }
  for (const quest of state.quests) {
    const card = document.createElement('article')
    card.className = `quest-card panel${quest.claimed ? ' claimed' : ''}`
    const header = document.createElement('header')
    const title = document.createElement('h3')
    title.textContent = quest.title
    const reward = document.createElement('span')
    reward.className = 'quest-reward'
    reward.textContent = `${formatNumber(quest.rewardCoins)} COINS`
    header.append(title, reward)
    const description = document.createElement('p')
    description.textContent = quest.description || 'Obiettivo Stellar.'
    const progress = document.createElement('div')
    progress.className = 'quest-progress'
    const meta = document.createElement('div')
    const current = document.createElement('span')
    current.textContent = `${quest.progress}/${quest.target}`
    const status = document.createElement('span')
    status.textContent = quest.claimed ? 'RISCATTATA' : quest.complete ? 'COMPLETATA' : quest.daily ? 'GIORNALIERA' : 'ATTIVA'
    meta.append(current, status)
    const track = document.createElement('div')
    track.className = 'track'
    const fill = document.createElement('span')
    fill.style.width = `${Math.max(0, Math.min(100, (Number(quest.progress || 0) / Math.max(1, Number(quest.target || 1))) * 100))}%`
    track.appendChild(fill)
    progress.append(meta, track)
    const button = document.createElement('button')
    button.className = quest.complete && !quest.claimed ? 'primary-button' : 'outline-button'
    button.textContent = quest.claimed ? 'Già riscattata' : quest.complete ? 'Riscatta ricompensa' : 'In corso'
    button.disabled = quest.claimed || !quest.complete
    button.addEventListener('click', async () => {
      button.disabled = true
      const result = await window.stellar.claimQuest(quest.id)
      if (!result.ok) {
        button.disabled = false
        return toast(result.error || 'Impossibile riscattare la quest.', 'error')
      }
      state.clientProfile = result.profile || state.clientProfile
      state.quests = result.profile?.quests || state.quests
      updateClientProfileUi()
      renderQuests()
      toast(`Ricompensa riscattata: ${quest.rewardCoins} Stellar Coins.`, 'success')
    })
    card.append(header, description, progress, button)
    root.appendChild(card)
  }
}

async function loadQuests () {
  const result = await window.stellar.listQuests()
  if (!result.ok) {
    state.quests = []
    renderQuests()
    appendLog(`Quest: ${result.error}`, 'error')
    return
  }
  state.quests = result.quests || []
  renderQuests()
  await loadClientProfile()
}

function renderStore () {
  const root = $('#storeItems')
  root.replaceChildren()
  if (!state.storeItems.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Collega Discord e avvia il backend Stellar per caricare lo store.'
    root.appendChild(empty)
    return
  }
  const owned = new Set(state.clientProfile?.inventory || [])
  for (const item of state.storeItems) {
    const card = document.createElement('article')
    card.className = 'store-item panel'
    const preview = document.createElement('div')
    preview.className = 'store-preview'
    const image = document.createElement('img')
    image.src = 'assets/logo-static.png'
    image.alt = ''
    preview.appendChild(image)
    const title = document.createElement('h3')
    title.textContent = item.name
    const description = document.createElement('p')
    description.textContent = item.description || 'Cosmetico originale Stellar.'
    card.append(preview, title, description)
    if (item.premiumOnly) {
      const premium = document.createElement('span')
      premium.className = 'premium-only'
      premium.textContent = 'RICHIEDE STELLAR PREMIUM'
      card.appendChild(premium)
    }
    const footer = document.createElement('footer')
    const price = document.createElement('span')
    price.className = 'price'
    price.textContent = `${formatNumber(item.price)} COINS`
    const button = document.createElement('button')
    const hasItem = owned.has(item.id)
    button.className = hasItem ? 'outline-button' : 'primary-button'
    button.textContent = hasItem ? 'Posseduto' : 'Acquista'
    button.disabled = hasItem
    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = 'Acquisto…'
      const result = await window.stellar.purchaseStoreItem(item.id)
      if (!result.ok) {
        button.disabled = false
        button.textContent = 'Riprova'
        return toast(result.error || 'Acquisto non riuscito.', 'error')
      }
      state.clientProfile = result.profile || state.clientProfile
      updateClientProfileUi()
      renderStore()
      toast(`${item.name} aggiunto al profilo.`, 'success')
    })
    footer.append(price, button)
    card.appendChild(footer)
    root.appendChild(card)
  }
}

async function loadStore () {
  const result = await window.stellar.listStore()
  if (!result.ok) {
    state.storeItems = []
    renderStore()
    appendLog(`Store: ${result.error}`, 'error')
    return
  }
  state.storeItems = result.items || []
  state.clientProfile = result.profile || state.clientProfile
  updateClientProfileUi()
  renderStore()
}

function renderAdminOverview () {
  const data = state.admin
  $('#adminUsers').textContent = formatNumber(data?.counts?.users || 0)
  $('#adminNewsCount').textContent = formatNumber(data?.counts?.announcements || 0)
  $('#adminQuestCount').textContent = formatNumber(data?.counts?.quests || 0)
  $('#adminPurchaseCount').textContent = formatNumber(data?.counts?.purchases || 0)
  const root = $('#adminAuditList')
  root.replaceChildren()
  const items = data?.recentAudit || []
  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Nessuna azione amministrativa registrata.'
    root.appendChild(empty)
    return
  }
  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'audit-row'
    const action = document.createElement('strong')
    action.textContent = item.action
    const target = document.createElement('span')
    target.textContent = `${item.actorName || 'Admin'} → ${item.target || 'Stellar'}`
    const time = document.createElement('time')
    time.textContent = formatDate(item.createdAt)
    row.append(action, target, time)
    root.appendChild(row)
  }
}

async function loadAdmin () {
  if (!state.clientProfile?.isAdmin) return
  const result = await window.stellar.getAdminOverview()
  if (!result.ok) return toast(result.error || 'Pannello Admin non disponibile.', 'error')
  state.admin = result
  renderAdminOverview()
}

function openPage (name) {
  $$('.page').forEach(page => page.classList.toggle('active', page.id === `page-${name}`))
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === name))
  if (name === 'mods') refreshInstalledMods()
  if (name === 'friends') loadFriends()
  if (name === 'discord') loadDiscordStatus()
  if (name === 'news') loadAnnouncements()
  if (name === 'quests') loadQuests()
  if (name === 'store') loadStore()
  if (name === 'admin') loadAdmin()
}

async function loadVersions () {
  try {
    const result = await window.stellar.getVersions()
    state.versions = Array.isArray(result.versions) ? result.versions : []
    if (!state.versions.find(v => v.id === state.settings.selectedVersion)) {
      const fallback = state.versions.find(v => v.type === 'release')
      if (fallback) state.settings = await window.stellar.saveSettings({ selectedVersion: fallback.id, versionType: fallback.type })
    }
    populateVersionSelects()
    await refreshVersionCapability({ autoFallback: true, save: true })
    await loadFabricLoaders()
    updateAccountUi()
    appendLog(`Caricate ${state.versions.length} versioni Minecraft.`, 'success')
  } catch (error) {
    appendLog(`Versioni Minecraft: ${error.message || error}`, 'error')
    toast('Impossibile caricare le versioni Minecraft.', 'error')
  }
}

function currentModQuery () {
  return {
    query: $('#modSearch').value.trim(),
    index: $('#modSort').value,
    offset: state.mods.offset,
    limit: state.mods.limit,
    gameVersion: $('#homeVersionSelect').value,
    loader: $('#homeLoaderSelect').value
  }
}
function createModCard (mod) {
  const card = document.createElement('article')
  card.className = 'mod-card'
  const head = document.createElement('div')
  head.className = 'mod-head'
  const image = document.createElement('img')
  image.className = 'mod-icon'
  image.alt = ''
  image.loading = 'lazy'
  image.src = mod.iconUrl || 'assets/logo-static.png'
  image.onerror = () => { image.src = 'assets/logo-static.png' }
  const title = document.createElement('div')
  title.className = 'mod-title'
  const strong = document.createElement('strong')
  strong.textContent = mod.title
  const small = document.createElement('small')
  small.textContent = `di ${mod.author || 'Modrinth'}`
  title.append(strong, small)
  head.append(image, title)
  const desc = document.createElement('p')
  desc.textContent = mod.description || 'Nessuna descrizione disponibile.'
  const meta = document.createElement('div')
  meta.className = 'mod-meta'
  const stats = document.createElement('span')
  stats.textContent = `${formatNumber(mod.downloads)} download`
  const button = document.createElement('button')
  button.className = 'mod-install'
  const installed = state.installed.some(item => item.projectId === mod.projectId)
  button.textContent = installed ? 'Installata' : 'Installa'
  button.classList.toggle('installed', installed)
  button.disabled = installed
  button.addEventListener('click', async () => {
    button.disabled = true
    button.textContent = 'Installazione…'
    const result = await window.stellar.installMod(mod.projectId, {}, settingsOverrides())
    if (!result.ok) {
      button.disabled = false
      button.textContent = 'Riprova'
      toast(result.error || 'Installazione non riuscita.', 'error')
      appendLog(`Mod ${mod.title}: ${result.error}`, 'error')
      return
    }
    toast(`${mod.title} installata con le dipendenze.`, 'success')
    appendLog(`Mod installata: ${mod.title}.`, 'success')
    await refreshInstalledMods()
    renderModResults()
  })
  meta.append(stats, button)
  card.append(head, desc, meta)
  return card
}
function renderModResults () {
  const root = $('#modResults')
  root.replaceChildren()
  if (state.mods.loading && !state.mods.hits.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Ricerca su Modrinth in corso…'
    root.appendChild(empty)
    return
  }
  if (!state.mods.hits.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Nessuna mod compatibile trovata per questo profilo.'
    root.appendChild(empty)
    return
  }
  const fragment = document.createDocumentFragment()
  for (const mod of state.mods.hits) fragment.appendChild(createModCard(mod))
  root.appendChild(fragment)
  setHidden($('#loadMoreMods'), state.mods.hits.length >= state.mods.total)
}
async function searchMods (append = false) {
  if (state.mods.loading) return
  if ($('#homeLoaderSelect').value !== 'fabric' || state.capability?.fabric !== true) {
    toast('Seleziona una versione con Fabric disponibile per usare Modrinth.', 'info')
    return
  }
  state.mods.loading = true
  if (!append) {
    state.mods.offset = 0
    state.mods.hits = []
  }
  renderModResults()
  const result = await window.stellar.searchMods(currentModQuery())
  state.mods.loading = false
  if (!result.ok) {
    appendLog(`Modrinth: ${result.error}`, 'error')
    toast(result.error || 'Ricerca Modrinth non riuscita.', 'error')
    renderModResults()
    return
  }
  state.mods.total = result.totalHits || 0
  state.mods.offset = (result.offset || 0) + (result.limit || state.mods.limit)
  state.mods.hits = append ? [...state.mods.hits, ...(result.hits || [])] : (result.hits || [])
  renderModResults()
  appendLog(`Modrinth: ${state.mods.hits.length}/${state.mods.total} risultati.`, 'info')
}
function createInstalledRow (mod) {
  const row = document.createElement('article')
  row.className = 'installed-row'
  if (mod.auditStatus) row.dataset.audit = mod.auditStatus
  const img = document.createElement('img')
  img.src = mod.iconUrl || 'assets/logo-static.png'
  img.alt = ''
  img.onerror = () => { img.src = 'assets/logo-static.png' }
  const info = document.createElement('div')
  info.className = 'installed-info'
  const strong = document.createElement('strong')
  strong.textContent = mod.title
  const small = document.createElement('small')
  small.textContent = `${mod.versionNumber || 'versione corrente'}${mod.dependency ? ' • dipendenza' : ''}`
  info.append(strong, small)
  if (mod.auditStatus && mod.auditStatus !== 'ok') {
    const audit = document.createElement('span')
    audit.className = 'audit-badge'
    audit.textContent = ({ missing: 'file mancante', corrupt: 'file danneggiato', 'wrong-version': 'versione errata', 'wrong-loader': 'loader errato' })[mod.auditStatus] || mod.auditStatus
    info.appendChild(audit)
  }
  const toggle = document.createElement('button')
  toggle.className = `toggle-button${mod.enabled ? ' enabled' : ''}`
  toggle.title = mod.enabled ? 'Disattiva' : 'Attiva'
  toggle.appendChild(icon(mod.enabled ? 'check' : 'pause'))
  toggle.addEventListener('click', async () => {
    const result = await window.stellar.toggleMod(mod.projectId, !mod.enabled, settingsOverrides())
    if (!result.ok) return toast(result.error || 'Impossibile modificare la mod.', 'error')
    await refreshInstalledMods()
  })
  const remove = document.createElement('button')
  remove.className = 'delete-button'
  remove.title = 'Disinstalla'
  remove.appendChild(icon('trash'))
  remove.addEventListener('click', async () => {
    const result = await window.stellar.uninstallMod(mod.projectId, settingsOverrides())
    if (!result.ok) return toast(result.error || 'Disinstallazione non riuscita.', 'error')
    toast(`${mod.title} rimossa.`, 'success')
    await refreshInstalledMods()
    renderModResults()
  })
  row.append(img, info, toggle, remove)
  return row
}
function renderInstalledMods () {
  const root = $('#installedMods')
  root.replaceChildren()
  if (!state.installed.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Nessuna mod installata in questo profilo.'
    root.appendChild(empty)
  } else {
    const fragment = document.createDocumentFragment()
    for (const mod of state.installed) fragment.appendChild(createInstalledRow(mod))
    root.appendChild(fragment)
  }
  $('#installedCount').textContent = String(state.installed.length)
  $('#installedSummary').textContent = `${state.installed.length} nel profilo`
}
async function refreshInstalledMods () {
  const result = await window.stellar.listInstalledMods(settingsOverrides())
  if (!result.ok) {
    appendLog(`Mod installate: ${result.error}`, 'error')
    return
  }
  state.installed = result.mods || []
  renderInstalledMods()
}
async function auditMods () {
  const button = $('#auditMods')
  button.disabled = true
  $('#modAuditStatus').textContent = 'CONTROLLO…'
  const result = await window.stellar.auditMods(settingsOverrides())
  button.disabled = false
  if (!result.ok) {
    $('#modAuditStatus').textContent = 'ERRORE'
    $('#modAuditStatus').className = 'status-pill muted'
    appendLog(`Audit mod: ${result.error}`, 'error')
    return toast(result.error || 'Controllo mod non riuscito.', 'error')
  }
  state.installed = result.mods || []
  renderInstalledMods()
  const problems = Number(result.problems || 0)
  $('#modAuditStatus').textContent = problems ? `${problems} PROBLEMI` : 'TUTTO OK'
  $('#modAuditStatus').className = problems ? 'status-pill muted' : 'status-pill online'
  appendLog(`Audit mod completato: ${result.total || 0} file, ${problems} problemi.`, problems ? 'error' : 'success')
  toast(problems ? `Trovati ${problems} problemi. Usa Ripara.` : 'Tutte le mod risultano integre.', problems ? 'error' : 'success')
}
async function repairMods () {
  const button = $('#repairMods')
  button.disabled = true
  $('#modAuditStatus').textContent = 'RIPARAZIONE…'
  const result = await window.stellar.repairMods(settingsOverrides())
  button.disabled = false
  if (!result.ok) {
    $('#modAuditStatus').textContent = 'ERRORE'
    return toast(result.error || 'Riparazione non riuscita.', 'error')
  }
  const audit = result.audit || { mods: [], problems: 0 }
  state.installed = audit.mods || []
  renderInstalledMods()
  $('#modAuditStatus').textContent = audit.problems ? `${audit.problems} PROBLEMI` : 'TUTTO OK'
  $('#modAuditStatus').className = audit.problems ? 'status-pill muted' : 'status-pill online'
  const failures = result.failures || []
  appendLog(`Riparazione mod: ${result.repaired?.length || 0} reinstallate, ${failures.length} errori.`, failures.length ? 'error' : 'success')
  toast(failures.length ? `Riparazione parziale: ${failures.length} errori.` : 'Mod riparate e verificate.', failures.length ? 'error' : 'success')
}
async function installPreset (preset, button) {
  button.disabled = true
  const previous = button.style.opacity
  button.style.opacity = '.65'
  const result = await window.stellar.installModPreset(preset, settingsOverrides())
  button.disabled = false
  button.style.opacity = previous
  if (!result.ok) return toast(result.error || 'Pacchetto non installato.', 'error')
  const failures = result.failures || []
  await refreshInstalledMods()
  if (failures.length) toast(`Pacchetto installato con ${failures.length} mod non compatibili.`, 'error')
  else toast('Pacchetto installato con dipendenze automatiche.', 'success')
  renderModResults()
}

function renderFriends () {
  const root = $('#friendsList')
  root.replaceChildren()
  if (!state.friends.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Aggiungi il primo amico Minecraft.'
    root.appendChild(empty)
    return
  }
  const fragment = document.createDocumentFragment()
  for (const friend of state.friends) {
    const row = document.createElement('article')
    row.className = 'friend-row'
    const avatar = document.createElement('div')
    avatar.className = 'friend-avatar'
    avatar.textContent = friend.name[0].toUpperCase()
    avatar.style.backgroundImage = `url("https://mc-heads.net/avatar/${encodeURIComponent(friend.name)}/64")`
    const copy = document.createElement('div')
    copy.className = 'friend-copy'
    const strong = document.createElement('strong')
    strong.textContent = friend.name
    const small = document.createElement('small')
    small.textContent = friend.status === 'online' ? 'Online su Stellar' : 'Offline'
    copy.append(strong, small)
    const remove = document.createElement('button')
    remove.className = 'friend-remove'
    remove.appendChild(icon('x'))
    remove.addEventListener('click', async () => {
      const result = await window.stellar.removeFriend(friend.id)
      if (!result.ok) return toast(result.error || 'Rimozione non riuscita.', 'error')
      state.friends = result.friends || []
      renderFriends()
    })
    row.append(avatar, copy, remove)
    fragment.appendChild(row)
  }
  root.appendChild(fragment)
}
async function loadFriends () {
  const result = await window.stellar.listFriends()
  if (!result.ok) return toast(result.error || 'Impossibile caricare gli amici.', 'error')
  state.friends = result.friends || []
  renderFriends()
  $('#socialModePill').textContent = result.serviceConfigured ? 'ONLINE' : 'LOCALE'
  $('#socialModePill').className = `status-pill ${result.serviceConfigured ? 'online' : 'muted'}`
  $('#socialStatusText').textContent = result.serviceConfigured
    ? 'Servizio community configurato. Presenza e richieste possono essere sincronizzate dal backend.'
    : 'Lista locale pronta. Configura il backend incluso nei sorgenti per presenza online reale.'
}
async function addFriend () {
  const input = $('#friendName')
  const result = await window.stellar.addFriend(input.value.trim())
  if (!result.ok) return toast(result.error || 'Nome Minecraft non valido.', 'error')
  input.value = ''
  state.friends = result.friends || []
  renderFriends()
}

function renderAnnouncements () {
  const root = $('#announcementList')
  root.replaceChildren()
  if (!state.announcements.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'Nessun annuncio disponibile.'
    root.appendChild(empty)
    return
  }
  const fragment = document.createDocumentFragment()
  for (const item of state.announcements) {
    const card = document.createElement('article')
    card.className = 'announcement-card'
    const header = document.createElement('header')
    const title = document.createElement('h3')
    title.textContent = item.title
    const time = document.createElement('time')
    time.textContent = formatDate(item.date || item.createdAt)
    header.append(title, time)
    const body = document.createElement('p')
    body.textContent = item.body
    const tag = document.createElement('span')
    tag.className = 'announcement-tag'
    tag.textContent = String(item.tag || item.type || 'NEWS').toUpperCase()
    card.append(header, body, tag)
    fragment.appendChild(card)
  }
  root.appendChild(fragment)
  const latest = state.announcements[0]
  $('#latestAnnouncementTitle').textContent = latest.title
  $('#latestAnnouncementBody').textContent = latest.body
  $('#newsBadge').textContent = String(state.announcements.length)
  setHidden($('#newsBadge'), state.announcements.length === 0)
}
async function loadAnnouncements () {
  const result = await window.stellar.listAnnouncements()
  state.announcements = result.items || []
  renderAnnouncements()
  if (!result.ok) appendLog(`Annunci: ${result.error}`, 'error')
}

function discordAvatarUrl (account) {
  if (!account?.id || !account?.avatar) return ''
  const ext = account.avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(account.id)}/${encodeURIComponent(account.avatar)}.${ext}?size=128`
}
function updateDiscordUi () {
  const account = state.discord.account || state.settings?.discordAccount
  const connected = Boolean(account?.id)
  state.discord.connected = connected
  const name = account?.globalName || account?.username || 'Nessun account'
  $('#discordName').textContent = name
  $('#discordSummary').textContent = connected ? name : 'Non collegato'
  $('#discordStatusPill').textContent = connected ? 'COLLEGATO' : 'SCOLLEGATO'
  $('#discordStatusPill').className = connected ? 'status-pill online' : 'status-pill muted'
  $('#discordConnect').textContent = connected ? 'Ricollega Discord' : 'Collega Discord'
  setHidden($('#discordLogout'), !connected)
  const avatar = $('#discordAvatar')
  const url = discordAvatarUrl(account)
  avatar.style.backgroundImage = url ? `url("${url}")` : ''
  const svg = avatar.querySelector('svg')
  if (svg) svg.style.display = url ? 'none' : ''
  const accessLabel = account?.isAdmin ? ' • Admin verificato' : account?.guildMember ? ' • Membro verificato' : ''
  $('#discordStatusText').textContent = connected
    ? `Account ${name} collegato con OAuth2${accessLabel}. La sessione viene conservata cifrata dal sistema operativo.`
    : 'Premi “Collega Discord” e autorizza l’app nel browser. Il client secret non viene salvato nel launcher.'
  if (!state.clientProfile) setHidden($('#adminNav'), !account?.isAdmin)
}
async function loadDiscordStatus () {
  const result = await window.stellar.getDiscordStatus()
  if (!result.ok) {
    appendLog(`Discord: ${result.error}`, 'error')
    return
  }
  state.discord.connected = Boolean(result.connected)
  state.discord.account = result.account || null
  if (state.settings) state.settings.discordAccount = result.account || null
  if (result.profile) state.clientProfile = result.profile
  updateDiscordUi()
  updateClientProfileUi()
}
async function connectDiscord () {
  if (state.discord.loading) return
  state.discord.loading = true
  $('#discordConnect').disabled = true
  $('#discordConnect').textContent = 'Attendi…'
  const result = await window.stellar.loginDiscord(settingsOverrides())
  state.discord.loading = false
  $('#discordConnect').disabled = false
  if (!result.ok) {
    updateDiscordUi()
    toast(result.error || 'Collegamento Discord non riuscito.', 'error')
    appendLog(`Discord OAuth: ${result.error}`, 'error')
    return
  }
  state.discord.account = result.account
  state.settings.discordAccount = result.account
  updateDiscordUi()
  await loadClientProfile()
  await Promise.all([loadQuests(), loadStore()])
  toast(`Discord collegato come ${result.account.globalName || result.account.username}.`, 'success')
  appendLog('Collegamento Discord completato.', 'success')
}
async function disconnectDiscord () {
  const result = await window.stellar.logoutDiscord()
  if (!result.ok) return toast(result.error || 'Disconnessione Discord non riuscita.', 'error')
  state.discord.account = null
  state.settings.discordAccount = null
  state.clientProfile = null
  state.quests = []
  state.storeItems = []
  updateDiscordUi()
  updateClientProfileUi()
  renderQuests()
  renderStore()
  toast('Discord disconnesso.', 'success')
}
async function inviteDiscordBot () {
  const result = await window.stellar.inviteDiscordBot(settingsOverrides())
  if (!result.ok) return toast(result.error || 'Impossibile aprire l’autorizzazione del bot.', 'error')
  toast('Autorizzazione bot aperta nel browser.', 'success')
}
async function openStore () {
  const result = await window.stellar.openStore($('#storeUrl').value.trim() || state.settings.storeUrl)
  if (!result.ok) toast(result.error || 'Impossibile aprire lo store.', 'error')
}


async function adminPublishAnnouncement () {
  const title = $('#adminNewsTitle').value.trim()
  const body = $('#adminNewsBody').value.trim()
  if (title.length < 3 || body.length < 3) return toast('Inserisci titolo e testo dell’annuncio.', 'error')
  const result = await window.stellar.adminCreateAnnouncement({ title, body, type: $('#adminNewsType').value })
  if (!result.ok) return toast(result.error || 'Pubblicazione non riuscita.', 'error')
  $('#adminNewsTitle').value = ''
  $('#adminNewsBody').value = ''
  toast('Annuncio pubblicato.', 'success')
  await Promise.all([loadAdmin(), loadAnnouncements()])
}

async function adminAdjustCoins () {
  const minecraftName = $('#adminCoinPlayer').value.trim()
  const amount = Number($('#adminCoinAmount').value)
  if (!minecraftName || !Number.isInteger(amount) || amount === 0) return toast('Nome e importo intero sono obbligatori.', 'error')
  const result = await window.stellar.adminAdjustCoins({ minecraftName, amount, reason: $('#adminCoinReason').value.trim() })
  if (!result.ok) return toast(result.error || 'Modifica coins non riuscita.', 'error')
  toast(`${result.minecraftName}: ${formatNumber(result.coins)} Stellar Coins.`, 'success')
  await loadAdmin()
}

async function adminSetPremium () {
  const minecraftName = $('#adminPremiumPlayer').value.trim()
  const days = Number($('#adminPremiumDays').value)
  if (!minecraftName || !Number.isInteger(days) || days < 0) return toast('Nome e giorni validi sono obbligatori.', 'error')
  const result = await window.stellar.adminSetPremium({ minecraftName, days })
  if (!result.ok) return toast(result.error || 'Modifica Premium non riuscita.', 'error')
  toast(days === 0 ? `Premium revocato a ${result.minecraftName}.` : `Premium aggiornato per ${result.minecraftName}.`, 'success')
  await loadAdmin()
}

async function adminCreateQuest () {
  const title = $('#adminQuestTitle').value.trim()
  const rewardCoins = Number($('#adminQuestReward').value)
  const target = Number($('#adminQuestTarget').value)
  if (title.length < 3 || !Number.isInteger(rewardCoins) || rewardCoins < 0 || !Number.isInteger(target) || target < 1) return toast('Completa titolo, ricompensa e target.', 'error')
  const result = await window.stellar.adminCreateQuest({
    title,
    description: $('#adminQuestDescription').value.trim(),
    rewardCoins,
    target,
    event: $('#adminQuestEvent').value.trim() || 'custom',
    daily: $('#adminQuestDaily').checked
  })
  if (!result.ok) return toast(result.error || 'Creazione quest non riuscita.', 'error')
  $('#adminQuestTitle').value = ''
  $('#adminQuestDescription').value = ''
  toast('Quest creata.', 'success')
  await Promise.all([loadAdmin(), loadQuests()])
}

async function login () {
  $('#deviceCode').textContent = 'ATTENDI…'
  $('#deviceMessage').textContent = 'Preparazione dell’accesso Microsoft…'
  $('#deviceModal').classList.remove('hidden')
  const result = await window.stellar.login()
  if (!result.ok) {
    toast(result.error || 'Accesso Microsoft non riuscito.', 'error')
    appendLog(`Accesso Microsoft: ${result.error}`, 'error')
    return
  }
  state.settings = await window.stellar.getSettings()
  applySettingsToUi()
  $('#deviceModal').classList.add('hidden')
  toast(`Accesso completato come ${result.account.name}.`, 'success')
  appendLog(`Accesso completato come ${result.account.name}.`, 'success')
}
async function logout () {
  const result = await window.stellar.logout()
  if (!result.ok) return toast(result.error || 'Disconnessione non riuscita.', 'error')
  state.settings.account = null
  updateAccountUi()
  toast('Account Microsoft disconnesso.', 'success')
}
async function saveSettings () {
  state.settings = await window.stellar.saveSettings(settingsOverrides())
  applySettingsToUi()
  await loadFabricLoaders()
  await refreshInstalledMods()
  toast('Impostazioni salvate.', 'success')
  appendLog('Impostazioni salvate.', 'success')
}
async function detectJava () {
  const version = $('#homeVersionSelect').value || state.settings.selectedVersion
  const result = await window.stellar.discoverJava(version)
  if (!result.found) return toast(`Java ${result.requiredMajor || 'compatibile'} non trovato per Minecraft ${version}.`, 'error')
  $('#javaPath').value = result.javaPath
  state.settings = await window.stellar.saveSettings({ javaPath: result.javaPath })
  toast(`Java ${result.major || ''} rilevato per Minecraft ${version}.`, 'success')
  appendLog(`Java ${result.major || '?'}: ${result.javaPath}`, 'success')
}
async function launchMinecraft () {
  if (state.launching) return
  if (!state.settings.account) {
    await login()
    if (!state.settings.account) return
  }
  state.launching = true
  $('#playButton').disabled = true
  setProgress(3, 'Preparazione del profilo…')
  const result = await window.stellar.launchMinecraft(settingsOverrides())
  if (!result.ok) {
    state.launching = false
    $('#playButton').disabled = false
    setProgress(0, result.error || 'Avvio non riuscito.')
    toast(result.error || 'Avvio non riuscito.', 'error')
    appendLog(`Avvio Minecraft: ${result.error}`, 'error')
  }
}

function registerEvents () {
  $$('[data-window-action]').forEach(button => button.addEventListener('click', () => window.stellar.windowAction(button.dataset.windowAction)))
  $$('.nav-item').forEach(button => button.addEventListener('click', () => openPage(button.dataset.page)))
  $$('[data-page-jump]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.pageJump)))
  $$('[data-open-folder]').forEach(button => button.addEventListener('click', async () => {
    const result = await window.stellar.openFolder(button.dataset.openFolder)
    if (!result.ok) toast(result.error || 'Impossibile aprire la cartella.', 'error')
  }))
  $('#accountCard').addEventListener('click', () => state.settings.account ? openPage('settings') : login())
  $('#playButton').addEventListener('click', launchMinecraft)
  $('#saveSettings').addEventListener('click', saveSettings)
  $('#discordConnect').addEventListener('click', connectDiscord)
  $('#discordLogout').addEventListener('click', disconnectDiscord)
  $('#discordInviteBot').addEventListener('click', inviteDiscordBot)
  $('#openStoreButton').addEventListener('click', openStore)
  $('#openStoreHero').addEventListener('click', openStore)
  $('#refreshStore').addEventListener('click', loadStore)
  $('#refreshQuests').addEventListener('click', loadQuests)
  $('#refreshAdmin').addEventListener('click', loadAdmin)
  $('#adminPublishNews').addEventListener('click', adminPublishAnnouncement)
  $('#adminApplyCoins').addEventListener('click', adminAdjustCoins)
  $('#adminApplyPremium').addEventListener('click', adminSetPremium)
  $('#adminCreateQuest').addEventListener('click', adminCreateQuest)
  $('#discordPresenceQuick').addEventListener('change', async () => {
    $('#discordPresenceEnabled').checked = $('#discordPresenceQuick').checked
    const result = await window.stellar.setDiscordPresence($('#discordPresenceQuick').checked)
    if (!result.ok) toast(result.error || 'Impossibile modificare la Rich Presence.', 'error')
  })
  $('#discordPresenceEnabled').addEventListener('change', () => { $('#discordPresenceQuick').checked = $('#discordPresenceEnabled').checked })
  $('#themeSelect').addEventListener('change', () => { document.documentElement.dataset.theme = $('#themeSelect').value })
  $('#discordRedirectUri').addEventListener('input', () => { $('#discordCallbackInfo').textContent = $('#discordRedirectUri').value || 'http://127.0.0.1:8787/auth/discord/callback' })
  $('#detectJava').addEventListener('click', detectJava)
  $('#browseJava').addEventListener('click', async () => {
    const path = await window.stellar.browseJava()
    if (path) $('#javaPath').value = path
  })
  $('#browseMinecraftRoot').addEventListener('click', async () => {
    const path = await window.stellar.browseMinecraftFolder()
    if (path) $('#minecraftRoot').value = path
  })
  $('#openLogs').addEventListener('click', () => window.stellar.openFolder('logs'))
  $('#clearLogs').addEventListener('click', () => { state.logs = []; renderLogs() })
  $('#memoryMax').addEventListener('input', updateMemorySlider)
  $('#uiScale').addEventListener('input', () => {
    $('#uiScaleValue').textContent = `${$('#uiScale').value}%`
    document.documentElement.style.setProperty('--ui-scale', String(Number($('#uiScale').value) / 100))
  })
  $('#reduceMotion').addEventListener('change', () => document.body.classList.toggle('reduce-motion', $('#reduceMotion').checked))
  const syncProfile = async (source) => {
    const version = source === 'settings' ? $('#settingsVersion').value : $('#homeVersionSelect').value
    const loader = source === 'settings' ? $('#settingsLoader').value : $('#homeLoaderSelect').value
    $('#homeVersionSelect').value = version
    $('#settingsVersion').value = version
    $('#homeLoaderSelect').value = loader
    $('#settingsLoader').value = loader
    state.settings = await window.stellar.saveSettings({ selectedVersion: version, versionType: state.versions.find(v => v.id === version)?.type || 'release', loader })
    await refreshVersionCapability({ autoFallback: true, save: true })
    await loadFabricLoaders()
    await refreshInstalledMods()
    updateAccountUi()
    state.mods.hits = []
    renderModResults()
  }
  $('#homeVersionSelect').addEventListener('change', () => syncProfile('home'))
  $('#settingsVersion').addEventListener('change', () => syncProfile('settings'))
  $('#homeLoaderSelect').addEventListener('change', () => syncProfile('home'))
  $('#settingsLoader').addEventListener('change', () => syncProfile('settings'))
  $('#searchModsButton').addEventListener('click', () => searchMods(false))
  $('#modSearch').addEventListener('keydown', event => { if (event.key === 'Enter') searchMods(false) })
  $('#modSort').addEventListener('change', () => searchMods(false))
  $('#loadMoreMods').addEventListener('click', () => searchMods(true))
  $('#auditMods').addEventListener('click', auditMods)
  $('#repairMods').addEventListener('click', repairMods)
  $$('.preset-card').forEach(button => button.addEventListener('click', () => installPreset(button.dataset.preset, button)))
  $$('[data-mod-tab]').forEach(tab => tab.addEventListener('click', () => {
    $$('[data-mod-tab]').forEach(item => item.classList.toggle('active', item === tab))
    $('#modBrowse').classList.toggle('active', tab.dataset.modTab === 'browse')
    $('#modInstalled').classList.toggle('active', tab.dataset.modTab === 'installed')
    if (tab.dataset.modTab === 'installed') refreshInstalledMods()
  }))
  $('#addFriendButton').addEventListener('click', addFriend)
  $('#friendName').addEventListener('keydown', event => { if (event.key === 'Enter') addFriend() })
  $('#refreshNews').addEventListener('click', loadAnnouncements)
  $$('.cosmetic-card').forEach(card => card.addEventListener('click', () => {
    $$('.cosmetic-card').forEach(item => item.classList.toggle('selected', item === card))
    $('#cosmeticName').textContent = card.dataset.cosmetic
  }))
  $('#deviceCode').addEventListener('click', async () => {
    const code = $('#deviceCode').textContent.trim()
    if (!code || code.includes('ATTENDI')) return
    try { await navigator.clipboard.writeText(code); toast('Codice copiato.', 'success') } catch { toast('Copia manualmente il codice.', 'error') }
  })
  $('#openDevicePage').addEventListener('click', () => window.stellar.openExternal(state.verificationUrl))
  $('#closeDeviceModal').addEventListener('click', () => $('#deviceModal').classList.add('hidden'))

  window.stellar.on('auth:device-code', payload => {
    state.verificationUrl = payload.verificationUrl || 'https://www.microsoft.com/link'
    $('#deviceCode').textContent = payload.userCode || '--------'
    $('#deviceMessage').textContent = payload.message || 'Apri Microsoft e inserisci il codice.'
    $('#deviceModal').classList.remove('hidden')
  })
  window.stellar.on('auth:state', payload => {
    if (payload.message) $('#deviceMessage').textContent = payload.message
  })
  window.stellar.on('mods:event', event => {
    if (event?.type === 'progress') appendLog(`${event.payload?.title || 'Mod'}: ${event.payload?.message || 'installazione…'}`, 'info')
    if (event?.type === 'complete') appendLog(`Installazione mod completata: ${event.payload?.count || 0} file.`, 'success')
  })
  window.stellar.on('minecraft:event', event => {
    if (!event) return
    if (event.type === 'data' || event.type === 'debug') appendLog(typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload), event.type === 'debug' ? 'debug' : 'info')
    if (event.type === 'download-status') {
      const p = event.payload || {}
      const percent = p.total ? 12 + (Number(p.current || 0) / Number(p.total)) * 72 : 25
      setProgress(percent, p.name || 'Download risorse…')
    }
    if (event.type === 'arguments') setProgress(91, 'Avvio processo Java…')
  })
  window.stellar.on('minecraft:state', payload => {
    appendLog(payload.message || payload.status, payload.status === 'error' ? 'error' : payload.status === 'running' ? 'success' : 'info')
    const progress = { auth: 7, java: 12, starting: 20, running: 100, closed: 0, error: 0 }
    setProgress(progress[payload.status] ?? 18, payload.message)
    if (payload.status === 'running') {
      state.launching = true
      $('#playButton').disabled = true
      $('#playSubtitle').textContent = 'Minecraft in esecuzione'
      toast('Minecraft avviato.', 'success')
    }
    if (payload.status === 'closed' || payload.status === 'error') {
      state.launching = false
      $('#playButton').disabled = false
      updateAccountUi()
      if (payload.status === 'error') toast(payload.message || 'Errore Minecraft.', 'error')
    }
  })
  window.stellar.on('discord:state', payload => {
    if (payload?.message) {
      appendLog(`Discord: ${payload.message}`, payload.status === 'error' ? 'error' : payload.status === 'success' ? 'success' : 'info')
      $('#discordStatusText').textContent = payload.message
    }
  })
  window.stellar.on('app:fatal-error', message => {
    appendLog(`Errore interno: ${message}`, 'error')
    toast('Errore interno. Controlla la console.', 'error')
  })
}

async function init () {
  registerEvents()
  renderLogs()
  $('#consoleTime').textContent = new Date().toLocaleTimeString('it-IT', { hour12: false })
  try {
    const [appInfo, settings] = await Promise.all([window.stellar.getAppInfo(), window.stellar.getSettings()])
    state.appInfo = appInfo
    state.settings = settings
    $('#appVersion').textContent = appInfo.version
    $('#heroBuild').textContent = appInfo.version
    applySettingsToUi()
    await loadVersions()
    await Promise.all([refreshInstalledMods(), loadFriends(), loadAnnouncements(), loadDiscordStatus()])
    if (state.discord.connected) {
      await loadClientProfile()
      await Promise.all([loadQuests(), loadStore()])
    } else {
      updateClientProfileUi()
      renderQuests()
      renderStore()
    }
    appendLog(`Stellar Client ${appInfo.version} avviato su ${appInfo.platform}.`, 'success')
    setTimeout(() => {
      $('#splash').classList.add('done')
      $('#app').classList.remove('is-loading')
    }, 850)
  } catch (error) {
    appendLog(`Inizializzazione: ${error.message || error}`, 'error')
    toast('Errore durante l’inizializzazione.', 'error')
    $('#splashText').textContent = 'Errore di inizializzazione'
  }
}

init()
