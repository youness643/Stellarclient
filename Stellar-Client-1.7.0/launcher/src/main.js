'use strict'

const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const { promisify } = require('util')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const http = require('http')
const net = require('net')

const execFileAsync = promisify(execFile)
const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const MODRINTH_API = 'https://api.modrinth.com/v2'
const STELLAR_USER_AGENT = 'StellarClient/1.7.0 (https://stellarclient.it; contact@stellarclient.it)'
const LIVE_CLIENT_ID = '00000000441cc96b'
const LIVE_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'
const DEFAULT_DISCORD_CLIENT_ID = '1251494893407305791'
const DEFAULT_DISCORD_REDIRECT = 'http://127.0.0.1:8787/auth/discord/callback'
const DISCORD_API = 'https://discord.com/api/v10'
const XBOX_ERRORS = {
  2148916227: 'Il tuo account Xbox risulta sospeso.',
  2148916229: 'L’account è limitato dalle impostazioni famiglia Xbox.',
  2148916233: 'Questo account non possiede ancora un profilo Xbox. Crealo su xbox.com.',
  2148916234: 'Devi accettare i termini di servizio Xbox.',
  2148916235: 'Xbox non consente l’accesso dalla regione associata all’account.',
  2148916236: 'Microsoft richiede una verifica dell’età.',
  2148916237: 'L’account ha raggiunto il limite di tempo di gioco.',
  2148916238: 'Account minorenne: aggiungilo a una famiglia Microsoft gestita da un adulto.'
}

const DEFAULT_SETTINGS = Object.freeze({
  selectedVersion: '1.21.8',
  versionType: 'release',
  loader: 'fabric',
  loaderVersion: 'latest',
  separateInstances: true,
  memoryMinGb: 2,
  memoryMaxGb: 6,
  javaPath: '',
  minecraftRoot: '',
  microsoftClientId: '',
  windowWidth: 1280,
  windowHeight: 720,
  fullscreen: false,
  closeLauncherOnGameStart: false,
  serverAddress: '',
  reduceMotion: false,
  uiScale: 100,
  announcementsUrl: 'http://127.0.0.1:8787/announcements',
  friendsServiceUrl: 'http://127.0.0.1:8787',
  storeUrl: 'https://stellarclient.it/store',
  coreCatalogUrl: '',
  autoInstallCore: true,
  protectVanillaResources: true,
  theme: 'aurora',
  discordClientId: DEFAULT_DISCORD_CLIENT_ID,
  discordRedirectUri: DEFAULT_DISCORD_REDIRECT,
  discordBotPermissions: '0',
  discordGuildId: '1528382367100571668',
  discordPresenceEnabled: true,
  discordAccount: null,
  account: null
})

let mainWindow = null
let launchInProgress = false
let activeGameProcess = null
let currentAuthPollAbort = null
let discordRpc = null
let discordCallbackServer = null

function dataRoot () { return path.join(app.getPath('appData'), 'StellarClient') }
function settingsPath () { return path.join(dataRoot(), 'settings.json') }
function authCachePath () { return path.join(dataRoot(), 'auth', 'credentials.dat') }
function discordAuthCachePath () { return path.join(dataRoot(), 'auth', 'discord.dat') }
function defaultMinecraftRoot () { return path.join(dataRoot(), 'minecraft') }
function friendsPath () { return path.join(dataRoot(), 'social', 'friends.json') }
function sanitizeFilePart (value) { return String(value || '').replace(/[^0-9A-Za-z._+-]+/g, '-').slice(0, 96) || 'default' }
function instanceIdFor (settings) { return `${sanitizeFilePart(settings.selectedVersion)}-${sanitizeFilePart(settings.loader || 'vanilla')}` }
function instanceRootFor (settings) {
  const sharedRoot = settings.minecraftRoot || defaultMinecraftRoot()
  return settings.separateInstances === false ? sharedRoot : path.join(sharedRoot, 'instances', instanceIdFor(settings))
}
function instancePathsFor (settings) {
  const root = instanceRootFor(settings)
  const stellar = path.join(root, '.stellar')
  const mods = path.join(root, 'mods')
  return {
    root,
    stellar,
    mods,
    disabledMods: path.join(mods, '.disabled'),
    modBackups: path.join(stellar, 'backups', 'mods'),
    modCache: path.join(stellar, 'cache', 'mods'),
    config: path.join(root, 'config'),
    resourcepacks: path.join(root, 'resourcepacks'),
    shaderpacks: path.join(root, 'shaderpacks'),
    saves: path.join(root, 'saves'),
    logs: path.join(root, 'logs'),
    screenshots: path.join(root, 'screenshots')
  }
}
function modManifestPathFor (settings) { return path.join(instancePathsFor(settings).stellar, 'mods', 'manifest.json') }
function legacyModManifestPathFor (settings) { return path.join(instancePathsFor(settings).stellar, 'mods.json') }

async function ensureInstanceLayout (settings) {
  const paths = instancePathsFor(settings)
  const managedModMetadata = path.join(paths.stellar, 'mods')
  for (const dir of [paths.root, paths.stellar, managedModMetadata, paths.mods, paths.disabledMods, paths.modBackups, paths.modCache, paths.config, paths.resourcepacks, paths.shaderpacks, paths.saves, paths.logs, paths.screenshots]) {
    await fsp.mkdir(dir, { recursive: true })
  }
  const metadataPath = path.join(paths.stellar, 'instance.json')
  await fsp.writeFile(metadataPath, JSON.stringify({
    schema: 1,
    id: instanceIdFor(settings),
    minecraft: settings.selectedVersion,
    loader: settings.loader,
    managedBy: 'Stellar Client',
    updatedAt: new Date().toISOString()
  }, null, 2), { encoding: 'utf8', mode: 0o600 })
  const readmePath = path.join(paths.mods, 'README-STELLAR.txt')
  if (!(await pathExists(readmePath))) {
    await fsp.writeFile(readmePath, [
      'STELLAR CLIENT - CARTELLA MOD',
      '',
      'Le mod attive (.jar) restano direttamente in questa cartella perché Fabric le possa caricare.',
      'Le mod disattivate vengono spostate in .disabled.',
      'Manifest, backup e cache sono conservati in .stellar per non sporcare Minecraft.',
      'Non spostare manualmente i file durante un aggiornamento o una riparazione.'
    ].join('\r\n'), 'utf8')
  }
  return paths
}

async function ensureDataDirs () {
  await fsp.mkdir(dataRoot(), { recursive: true })
  await fsp.mkdir(path.dirname(authCachePath()), { recursive: true })
  await fsp.mkdir(path.dirname(discordAuthCachePath()), { recursive: true })
}

function clampNumber (value, min, max, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function sanitizeSettings (candidate = {}) {
  const selectedVersion = typeof candidate.selectedVersion === 'string' && /^[0-9A-Za-z._+\-]{1,64}$/.test(candidate.selectedVersion)
    ? candidate.selectedVersion
    : DEFAULT_SETTINGS.selectedVersion
  const loader = ['vanilla', 'fabric'].includes(candidate.loader) ? candidate.loader : DEFAULT_SETTINGS.loader
  return {
    selectedVersion,
    versionType: 'release',
    loader,
    loaderVersion: typeof candidate.loaderVersion === 'string' && /^[0-9A-Za-z._+\-]{1,64}$/.test(candidate.loaderVersion)
      ? candidate.loaderVersion
      : DEFAULT_SETTINGS.loaderVersion,
    separateInstances: candidate.separateInstances !== false,
    memoryMinGb: 2,
    memoryMaxGb: clampNumber(candidate.memoryMaxGb, 2, 16, DEFAULT_SETTINGS.memoryMaxGb),
    javaPath: typeof candidate.javaPath === 'string' ? candidate.javaPath.slice(0, 1024) : '',
    minecraftRoot: typeof candidate.minecraftRoot === 'string' ? candidate.minecraftRoot.slice(0, 1024) : '',
    microsoftClientId: typeof candidate.microsoftClientId === 'string' ? candidate.microsoftClientId.trim().slice(0, 128) : '',
    windowWidth: clampNumber(candidate.windowWidth, 854, 7680, DEFAULT_SETTINGS.windowWidth),
    windowHeight: clampNumber(candidate.windowHeight, 480, 4320, DEFAULT_SETTINGS.windowHeight),
    fullscreen: Boolean(candidate.fullscreen),
    closeLauncherOnGameStart: Boolean(candidate.closeLauncherOnGameStart),
    serverAddress: typeof candidate.serverAddress === 'string' ? candidate.serverAddress.trim().slice(0, 255) : '',
    reduceMotion: Boolean(candidate.reduceMotion),
    uiScale: clampNumber(candidate.uiScale, 80, 125, DEFAULT_SETTINGS.uiScale),
    announcementsUrl: typeof candidate.announcementsUrl === 'string' ? candidate.announcementsUrl.trim().slice(0, 2048) : '',
    friendsServiceUrl: typeof candidate.friendsServiceUrl === 'string' ? candidate.friendsServiceUrl.trim().slice(0, 2048) : '',
    storeUrl: typeof candidate.storeUrl === 'string' ? candidate.storeUrl.trim().slice(0, 2048) : DEFAULT_SETTINGS.storeUrl,
    coreCatalogUrl: typeof candidate.coreCatalogUrl === 'string' ? candidate.coreCatalogUrl.trim().slice(0, 2048) : '',
    autoInstallCore: candidate.autoInstallCore !== false,
    protectVanillaResources: candidate.protectVanillaResources !== false,
    theme: ['aurora', 'noctis', 'frost', 'tempest'].includes(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    discordClientId: typeof candidate.discordClientId === 'string' && /^\d{15,22}$/.test(candidate.discordClientId.trim()) ? candidate.discordClientId.trim() : DEFAULT_SETTINGS.discordClientId,
    discordRedirectUri: typeof candidate.discordRedirectUri === 'string' && /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d{2,5})?|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{2,5})?)\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]{1,500}$/i.test(candidate.discordRedirectUri.trim()) ? candidate.discordRedirectUri.trim() : DEFAULT_SETTINGS.discordRedirectUri,
    discordBotPermissions: typeof candidate.discordBotPermissions === 'string' && /^\d{1,24}$/.test(candidate.discordBotPermissions.trim()) ? candidate.discordBotPermissions.trim() : DEFAULT_SETTINGS.discordBotPermissions,
    discordGuildId: typeof candidate.discordGuildId === 'string' && /^\d{0,22}$/.test(candidate.discordGuildId.trim()) ? candidate.discordGuildId.trim() : '',
    discordPresenceEnabled: candidate.discordPresenceEnabled !== false,
    discordAccount: candidate.discordAccount && typeof candidate.discordAccount === 'object'
      ? {
          id: String(candidate.discordAccount.id || '').replace(/\D/g, '').slice(0, 22),
          username: String(candidate.discordAccount.username || '').slice(0, 64),
          globalName: String(candidate.discordAccount.globalName || '').slice(0, 64),
          avatar: String(candidate.discordAccount.avatar || '').slice(0, 128),
          linkedAt: String(candidate.discordAccount.linkedAt || ''),
          guildMember: Boolean(candidate.discordAccount.guildMember),
          isAdmin: Boolean(candidate.discordAccount.isAdmin)
        }
      : null,
    account: candidate.account && typeof candidate.account === 'object'
      ? {
          id: String(candidate.account.id || '').replace(/[^0-9a-f]/gi, '').slice(0, 32),
          name: String(candidate.account.name || '').slice(0, 32),
          skinUrl: typeof candidate.account.skinUrl === 'string' ? candidate.account.skinUrl.slice(0, 2048) : '',
          signedInAt: String(candidate.account.signedInAt || '')
        }
      : null
  }
}

async function loadSettings () {
  await ensureDataDirs()
  try {
    const raw = await fsp.readFile(settingsPath(), 'utf8')
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to load settings:', error)
    return sanitizeSettings(DEFAULT_SETTINGS)
  }
}

async function saveSettings (updates) {
  const current = await loadSettings()
  const next = sanitizeSettings({ ...current, ...updates })
  if (next.memoryMaxGb < next.memoryMinGb) next.memoryMaxGb = next.memoryMinGb
  await fsp.writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function sendToRenderer (channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function safeError (error) {
  const message = error && error.message ? error.message : String(error || 'Errore sconosciuto')
  return message
    .replace(/(access|refresh|xsts|bearer|identity|token)[=: ]+[A-Za-z0-9._-]+/gi, '$1=[redacted]')
    .slice(0, 1500)
}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function fetchJson (url, options = {}, label = 'richiesta') {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': STELLAR_USER_AGENT,
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!response.ok) {
    const detail = data.error_description || data.errorMessage || data.Message || data.message || data.raw || `HTTP ${response.status}`
    const error = new Error(`${label}: ${detail}`)
    error.status = response.status
    error.response = data
    throw error
  }
  return data
}

async function loadAuthCache () {
  try {
    const raw = await fsp.readFile(authCachePath())
    if (raw.length === 0) return null
    let json
    if (raw.subarray(0, 4).toString() === 'ENC:') {
      if (!safeStorage.isEncryptionAvailable()) return null
      json = safeStorage.decryptString(Buffer.from(raw.subarray(4).toString(), 'base64'))
    } else {
      json = raw.toString('utf8')
    }
    return JSON.parse(json)
  } catch {
    return null
  }
}

async function saveAuthCache (data) {
  await fsp.mkdir(path.dirname(authCachePath()), { recursive: true })
  await fsp.mkdir(path.dirname(discordAuthCachePath()), { recursive: true })
  const json = JSON.stringify(data)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json).toString('base64')
    await fsp.writeFile(authCachePath(), `ENC:${encrypted}`, { mode: 0o600 })
  } else {
    await fsp.writeFile(authCachePath(), json, { mode: 0o600 })
  }
}

async function loadSecureJson (file) {
  try {
    const raw = await fsp.readFile(file)
    if (!raw.length) return null
    const text = raw.subarray(0, 4).toString() === 'ENC:'
      ? (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(raw.subarray(4).toString(), 'base64')) : '')
      : raw.toString('utf8')
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

async function saveSecureJson (file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const json = JSON.stringify(value)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json).toString('base64')
    await fsp.writeFile(file, `ENC:${encrypted}`, { mode: 0o600 })
  } else {
    await fsp.writeFile(file, json, { mode: 0o600 })
  }
}

function base64Url (value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function discordAccountFromUser (user) {
  return {
    id: String(user.id || ''),
    username: String(user.username || ''),
    globalName: String(user.global_name || user.globalName || user.username || ''),
    avatar: String(user.avatar || ''),
    linkedAt: String(user.linkedAt || new Date().toISOString()),
    guildMember: Boolean(user.guildMember),
    isAdmin: Boolean(user.isAdmin)
  }
}

function closeDiscordCallbackServer () {
  if (!discordCallbackServer) return
  try { discordCallbackServer.close() } catch {}
  discordCallbackServer = null
}

async function exchangeDiscordCode (settings, code, verifier) {
  const body = new URLSearchParams({
    client_id: settings.discordClientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: settings.discordRedirectUri,
    code_verifier: verifier
  })
  return fetchJson(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 'Accesso Discord')
}

async function refreshDiscordToken (settings, cached) {
  if (!cached?.refreshToken) throw new Error('Sessione Discord scaduta. Ricollega Discord.')
  const body = new URLSearchParams({
    client_id: settings.discordClientId,
    grant_type: 'refresh_token',
    refresh_token: cached.refreshToken
  })
  const token = await fetchJson(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 'Rinnovo Discord')
  const next = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || cached.refreshToken,
    tokenType: token.token_type || 'Bearer',
    scope: token.scope || cached.scope || 'identify',
    expiresAt: Date.now() + Math.max(60, Number(token.expires_in || 604800)) * 1000
  }
  await saveSecureJson(discordAuthCachePath(), next)
  return next
}

async function currentDiscordToken (settings) {
  const cached = await loadSecureJson(discordAuthCachePath())
  if (!cached?.accessToken) return null
  if (Number(cached.expiresAt || 0) > Date.now() + 60_000) return cached
  return refreshDiscordToken(settings, cached)
}

async function fetchDiscordUser (accessToken) {
  return fetchJson(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 'Profilo Discord')
}

async function loginDiscordViaBackend (settings) {
  const base = serviceUrl(settings.friendsServiceUrl)
  if (!base) throw new Error('Configura prima l’URL del backend Stellar Social nelle Impostazioni.')
  if (!settings.account?.name) throw new Error('Accedi prima con Microsoft per collegare Discord al profilo Minecraft.')
  const start = await fetchJson(`${base}/auth/discord/desktop/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minecraftName: settings.account.name })
  }, 'Avvio collegamento Discord')
  if (!start.pairingId || !/^https?:\/\//i.test(start.authorizeUrl || '')) throw new Error('Il backend Discord ha restituito una risposta non valida.')
  sendToRenderer('discord:state', { status: 'waiting', message: 'Autorizza Stellar Client nel browser.' })
  await shell.openExternal(start.authorizeUrl)
  const deadline = Date.now() + Math.min(10 * 60 * 1000, Math.max(60_000, Number(start.expiresIn || 600) * 1000))
  while (Date.now() < deadline) {
    await sleep(2500)
    try {
      const status = await fetchJson(`${base}/auth/discord/desktop/status?pairing_id=${encodeURIComponent(start.pairingId)}`, {}, 'Stato collegamento Discord')
      if (status.status !== 'complete') continue
      const account = discordAccountFromUser(status.user || {})
      if (!account.id || !status.desktopToken) throw new Error('Profilo Discord o sessione Stellar non validi.')
      await saveSecureJson(discordAuthCachePath(), {
        desktopToken: String(status.desktopToken),
        backend: base,
        createdAt: Date.now()
      })
      await saveSettings({ discordAccount: account })
      return account
    } catch (error) {
      if (error.status === 404) throw new Error('Collegamento Discord scaduto. Riprova.')
      if (String(error.message || '').includes('Stato collegamento Discord')) continue
      throw error
    }
  }
  throw new Error('Autorizzazione Discord scaduta. Riprova.')
}

async function loginDiscord (settings) {
  const backend = serviceUrl(settings.friendsServiceUrl)
  if (backend) return loginDiscordViaBackend(settings)
  throw new Error('Configura il backend Stellar Social: il client secret Discord deve restare sul server, non nel launcher.')
  /* Fallback desktop diretto disabilitato: il flusso sicuro usa il callback del backend. */
  if (!/^\d{15,22}$/.test(settings.discordClientId)) throw new Error('Configura un Discord Application ID valido.')
  const redirect = new URL(settings.discordRedirectUri)
  if (redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(redirect.hostname)) {
    throw new Error('Il callback Discord desktop deve usare http://127.0.0.1 oppure localhost.')
  }
  const port = Number(redirect.port || 80)
  if (port < 1024 || port > 65535) throw new Error('Porta callback Discord non valida.')

  closeDiscordCallbackServer()
  const verifier = base64Url(crypto.randomBytes(48))
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64Url(crypto.randomBytes(24))
  const authorizationUrl = new URL('https://discord.com/oauth2/authorize')
  authorizationUrl.search = new URLSearchParams({
    client_id: settings.discordClientId,
    response_type: 'code',
    redirect_uri: settings.discordRedirectUri,
    scope: 'identify guilds',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent'
  }).toString()

  const code = await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      closeDiscordCallbackServer()
      if (error) reject(error)
      else resolve(value)
    }
    const timeout = setTimeout(() => finish(new Error('Autorizzazione Discord scaduta. Riprova.')), 180_000)
    discordCallbackServer = http.createServer((request, response) => {
      try {
        const incoming = new URL(request.url, settings.discordRedirectUri)
        if (incoming.pathname !== redirect.pathname) {
          response.writeHead(404).end('Not found')
          return
        }
        if (incoming.searchParams.get('state') !== state) throw new Error('Stato OAuth Discord non valido.')
        const error = incoming.searchParams.get('error')
        if (error) throw new Error(incoming.searchParams.get('error_description') || error)
        const authCode = incoming.searchParams.get('code')
        if (!authCode) throw new Error('Discord non ha restituito il codice di autorizzazione.')
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
        })
        response.end('<!doctype html><meta charset="utf-8"><title>Stellar Client</title><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#09070d;color:#f5f2ff;font:16px system-ui}.card{padding:32px 38px;border:1px solid #4b3474;border-radius:22px;background:#15101f;text-align:center;box-shadow:0 24px 80px #000}.dot{width:12px;height:12px;border-radius:50%;background:#8b5cf6;margin:0 auto 14px;box-shadow:0 0 24px #8b5cf6}</style><div class="card"><div class="dot"></div><b>Discord collegato</b><p>Puoi tornare a Stellar Client.</p></div>')
        finish(null, authCode)
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end('Autorizzazione non riuscita. Torna a Stellar Client.')
        finish(error)
      }
    })
    discordCallbackServer.once('error', error => finish(new Error(`Callback Discord: ${error.message}`)))
    discordCallbackServer.listen(port, redirect.hostname, async () => {
      sendToRenderer('discord:state', { status: 'waiting', message: 'Autorizza Stellar Client nella finestra Discord.' })
      await shell.openExternal(authorizationUrl.toString()).catch(error => finish(error))
    })
  })

  const token = await exchangeDiscordCode(settings, code, verifier)
  const secure = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    tokenType: token.token_type || 'Bearer',
    scope: token.scope || 'identify guilds',
    expiresAt: Date.now() + Math.max(60, Number(token.expires_in || 604800)) * 1000
  }
  await saveSecureJson(discordAuthCachePath(), secure)
  const user = await fetchDiscordUser(secure.accessToken)
  const account = discordAccountFromUser(user)
  await saveSettings({ discordAccount: account })
  return account
}


async function stellarDesktopSession (settings) {
  const cached = await loadSecureJson(discordAuthCachePath())
  const base = serviceUrl(settings.friendsServiceUrl)
  if (!cached?.desktopToken || !base) return null
  if (cached.backend && serviceUrl(cached.backend) !== base) return null
  return { token: String(cached.desktopToken), base }
}

async function stellarApi (settings, pathname, options = {}) {
  const session = await stellarDesktopSession(settings)
  if (!session) throw new Error('Collega Discord per usare Store, Quest e pannello Admin.')
  const response = await fetchJson(`${session.base}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }, 'Servizio Stellar')
  return response
}

async function clientProfile (settings) {
  const payload = await stellarApi(settings, '/client/me')
  return payload.profile || null
}

async function clientStore (settings) {
  return stellarApi(settings, '/client/store')
}

async function purchaseStoreItem (settings, itemId) {
  return stellarApi(settings, '/client/store/purchase', {
    method: 'POST',
    body: JSON.stringify({ itemId: String(itemId || '') })
  })
}

async function clientQuests (settings) {
  return stellarApi(settings, '/client/quests')
}

async function claimQuest (settings, questId) {
  return stellarApi(settings, '/client/quests/claim', {
    method: 'POST',
    body: JSON.stringify({ questId: String(questId || '') })
  })
}

async function sendQuestEvent (settings, event, amount = 1) {
  return stellarApi(settings, '/client/quest-event', {
    method: 'POST',
    body: JSON.stringify({ event: String(event || ''), amount: Number(amount || 1) })
  })
}

async function adminApi (settings, pathname, body) {
  return stellarApi(settings, pathname, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}

function discordBotInviteUrl (settings) {
  const url = new URL('https://discord.com/oauth2/authorize')
  const params = new URLSearchParams({
    client_id: settings.discordClientId,
    scope: 'bot applications.commands',
    permissions: settings.discordBotPermissions || '0',
    integration_type: '0'
  })
  if (settings.discordGuildId) {
    params.set('guild_id', settings.discordGuildId)
    params.set('disable_guild_select', 'false')
  }
  url.search = params.toString()
  return url.toString()
}

class DiscordRpcConnection {
  constructor (clientId) {
    this.clientId = clientId
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.ready = false
  }

  async connect () {
    if (process.platform !== 'win32') return false
    if (this.socket && !this.socket.destroyed && this.ready) return true
    for (let index = 0; index < 10; index++) {
      const connected = await new Promise(resolve => {
        const socket = net.createConnection(`\\\\?\\pipe\\discord-ipc-${index}`)
        const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 700)
        socket.once('connect', () => {
          clearTimeout(timer)
          this.socket = socket
          this.buffer = Buffer.alloc(0)
          socket.on('data', chunk => this.onData(chunk))
          socket.on('error', () => { this.ready = false })
          socket.on('close', () => { this.ready = false; this.socket = null })
          this.write(0, { v: 1, client_id: this.clientId })
          setTimeout(() => resolve(Boolean(this.socket && !this.socket.destroyed)), 120)
        })
        socket.once('error', () => { clearTimeout(timer); resolve(false) })
      })
      if (connected) return true
    }
    return false
  }

  onData (chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const length = this.buffer.readInt32LE(4)
      if (length < 0 || length > 8 * 1024 * 1024 || this.buffer.length < 8 + length) return
      const payload = this.buffer.subarray(8, 8 + length).toString('utf8')
      this.buffer = this.buffer.subarray(8 + length)
      try {
        const message = JSON.parse(payload)
        if (message.evt === 'READY') this.ready = true
      } catch {}
    }
  }

  write (opcode, payload) {
    if (!this.socket || this.socket.destroyed) return
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const frame = Buffer.allocUnsafe(8 + body.length)
    frame.writeInt32LE(opcode, 0)
    frame.writeInt32LE(body.length, 4)
    body.copy(frame, 8)
    this.socket.write(frame)
  }

  async setActivity (activity) {
    if (!(await this.connect())) return false
    this.write(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: crypto.randomUUID() })
    return true
  }

  close () {
    try { this.socket?.destroy() } catch {}
    this.socket = null
    this.ready = false
  }
}

async function setDiscordPresence (settings, mode = 'launcher', detail = '') {
  if (!settings.discordPresenceEnabled || !settings.discordClientId) return false
  try {
    if (!discordRpc || discordRpc.clientId !== settings.discordClientId) {
      discordRpc?.close()
      discordRpc = new DiscordRpcConnection(settings.discordClientId)
    }
    const shared = {
      timestamps: { start: Math.floor(Date.now() / 1000) },
      assets: { large_image: 'stellar_logo', large_text: 'Stellar Client 1.7.0' },
      buttons: [{ label: 'Open Stellar', url: 'https://stellarclient.it' }],
      instance: false
    }
    const activity = mode === 'playing'
      ? { ...shared, details: `stellarClient ${settings.selectedVersion}`, state: detail || `${settings.loader === 'fabric' ? 'Fabric' : 'Vanilla'} • In game` }
      : { ...shared, details: 'Stellar Client', state: detail || 'Nel launcher' }
    return discordRpc.setActivity(activity)
  } catch {
    return false
  }
}

function authMode (settings) {
  return settings.microsoftClientId
    ? { mode: 'msal', clientId: settings.microsoftClientId, scope: 'XboxLive.signin offline_access' }
    : { mode: 'live', clientId: LIVE_CLIENT_ID, scope: LIVE_SCOPE }
}

async function requestDeviceCode (modeInfo) {
  const isMsal = modeInfo.mode === 'msal'
  const endpoint = isMsal
    ? 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
    : 'https://login.live.com/oauth20_connect.srf'
  const body = new URLSearchParams({
    client_id: modeInfo.clientId,
    scope: modeInfo.scope,
    ...(isMsal ? {} : { response_type: 'device_code' })
  })
  return fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }, 'Richiesta codice Microsoft')
}

async function pollDeviceCode (modeInfo, code) {
  const isMsal = modeInfo.mode === 'msal'
  const endpoint = isMsal
    ? 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    : `https://login.live.com/oauth20_token.srf?client_id=${encodeURIComponent(modeInfo.clientId)}`
  const deadline = Date.now() + (Number(code.expires_in || 900) * 1000)
  const interval = Math.max(3, Number(code.interval || 5)) * 1000
  const abort = { cancelled: false }
  currentAuthPollAbort = abort

  while (Date.now() < deadline && !abort.cancelled) {
    await sleep(interval)
    const body = new URLSearchParams({
      client_id: modeInfo.clientId,
      device_code: code.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      ...(isMsal ? { scope: modeInfo.scope } : {})
    })
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': STELLAR_USER_AGENT },
      body: body.toString()
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.access_token) {
      currentAuthPollAbort = null
      return data
    }
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      await sleep(5000)
      continue
    }
    if (data.error === 'authorization_declined') throw new Error('Accesso Microsoft rifiutato.')
    if (data.error === 'expired_token' || data.error === 'code_expired') throw new Error('Il codice Microsoft è scaduto.')
    throw new Error(data.error_description || data.message || `Accesso Microsoft non riuscito (${response.status}).`)
  }
  currentAuthPollAbort = null
  throw new Error('Accesso Microsoft scaduto. Riprova.')
}

async function refreshMicrosoftToken (modeInfo, refreshToken) {
  const endpoint = modeInfo.mode === 'msal'
    ? 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    : 'https://login.live.com/oauth20_token.srf'
  const body = new URLSearchParams({
    client_id: modeInfo.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: modeInfo.scope
  })
  return fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }, 'Aggiornamento accesso Microsoft')
}

async function acquireMicrosoftToken (settings, forceInteractive = false) {
  const modeInfo = authMode(settings)
  const cache = await loadAuthCache()
  if (!forceInteractive && cache && cache.mode === modeInfo.mode && cache.clientId === modeInfo.clientId) {
    if (cache.accessToken && Number(cache.expiresAt) > Date.now() + 60000) return { ...modeInfo, accessToken: cache.accessToken }
    if (cache.refreshToken) {
      try {
        const refreshed = await refreshMicrosoftToken(modeInfo, cache.refreshToken)
        const next = {
          mode: modeInfo.mode,
          clientId: modeInfo.clientId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || cache.refreshToken,
          expiresAt: Date.now() + (Number(refreshed.expires_in || 3600) * 1000)
        }
        await saveAuthCache(next)
        return { ...modeInfo, accessToken: next.accessToken }
      } catch (error) {
        console.warn('Token refresh failed:', safeError(error))
      }
    }
  }

  const code = await requestDeviceCode(modeInfo)
  const verificationUrl = code.verification_uri || code.verification_url || 'https://www.microsoft.com/link'
  sendToRenderer('auth:device-code', {
    userCode: code.user_code,
    verificationUrl,
    expiresIn: code.expires_in,
    message: code.message || `Apri ${verificationUrl} e inserisci il codice ${code.user_code}.`
  })
  shell.openExternal(verificationUrl).catch(() => {})
  const token = await pollDeviceCode(modeInfo, code)
  const next = {
    mode: modeInfo.mode,
    clientId: modeInfo.clientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    expiresAt: Date.now() + (Number(token.expires_in || 3600) * 1000)
  }
  await saveAuthCache(next)
  return { ...modeInfo, accessToken: next.accessToken }
}

async function xboxAndMinecraftLogin (msa) {
  const rpsPrefix = msa.mode === 'msal' ? 'd=' : 't='
  const userToken = await fetchJson('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-xbl-contract-version': '2' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `${rpsPrefix}${msa.accessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  }, 'Autenticazione Xbox Live')

  let xsts
  try {
    xsts = await fetchJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-xbl-contract-version': '1' },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [userToken.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      })
    }, 'Autorizzazione Xbox XSTS')
  } catch (error) {
    const xerr = Number(error.response && (error.response.XErr || error.response.xerr))
    if (XBOX_ERRORS[xerr]) throw new Error(XBOX_ERRORS[xerr])
    throw error
  }

  const xui = xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0]
  const userHash = xui && xui.uhs
  if (!userHash || !xsts.Token) throw new Error('Xbox non ha restituito un token XSTS valido.')

  const minecraftAuth = await fetchJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xsts.Token}` })
  }, 'Accesso ai servizi Minecraft')

  const headers = { Authorization: `Bearer ${minecraftAuth.access_token}` }
  const profile = await fetchJson('https://api.minecraftservices.com/minecraft/profile', { headers }, 'Profilo Minecraft Java')
  const entitlements = await fetchJson(`https://api.minecraftservices.com/entitlements/mcstore?requestId=${crypto.randomUUID()}`, { headers }, 'Licenza Minecraft Java').catch(() => null)

  if (!profile || !profile.id || !profile.name) throw new Error('Questo account non dispone di un profilo Minecraft: Java Edition.')
  return {
    token: minecraftAuth.access_token,
    expiresAt: Date.now() + (Number(minecraftAuth.expires_in || 86400) * 1000),
    profile,
    entitlements,
    xuid: (xui && (xui.xid || xui.xuid)) || ''
  }
}

async function getMinecraftIdentity (settings, forceInteractive = false) {
  const msa = await acquireMicrosoftToken(settings, forceInteractive)
  return xboxAndMinecraftLogin(msa)
}

function numericReleaseParts (id) {
  const match = String(id || '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null
}

function isReleaseAtLeast18 (id) {
  const parts = numericReleaseParts(id)
  if (!parts) return false
  if (parts[0] >= 2) return true
  return parts[0] === 1 && parts[1] >= 8
}

function isLegacyPreFabricRelease (id) {
  const parts = numericReleaseParts(id)
  if (!parts || parts[0] !== 1) return false
  return parts[1] < 14
}

async function fetchVersions () {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const manifest = await fetchJson(VERSION_MANIFEST, { signal: controller.signal }, 'Manifest Minecraft')
    const releases = manifest.versions
      .filter(item => item.type === 'release' && isReleaseAtLeast18(item.id))
      .map(({ id, releaseTime }) => ({
        id,
        type: 'release',
        releaseTime,
        legacyVanilla: isLegacyPreFabricRelease(id)
      }))
    return {
      latest: { release: manifest.latest.release },
      versions: releases
    }
  } finally {
    clearTimeout(timer)
  }
}

let manifestCache = null
let manifestCachedAt = 0
const versionCapabilityCache = new Map()

async function getVersionManifest () {
  if (manifestCache && Date.now() - manifestCachedAt < 5 * 60 * 1000) return manifestCache
  manifestCache = await fetchJson(VERSION_MANIFEST, {}, 'Manifest Minecraft')
  manifestCachedAt = Date.now()
  return manifestCache
}

async function getVersionCapabilities (gameVersion) {
  const id = String(gameVersion || DEFAULT_SETTINGS.selectedVersion)
  const cached = versionCapabilityCache.get(id)
  if (cached && Date.now() - cached.cachedAt < 10 * 60 * 1000) return cached.value

  const manifest = await getVersionManifest()
  const manifestEntry = manifest.versions.find(item => item.id === id)
  if (!manifestEntry) throw new Error(`Versione Minecraft non trovata: ${id}`)

  let fabric = false
  let fabricStatus = 'unsupported'
  let loaders = []
  try {
    loaders = await listFabricLoaders(id)
    fabric = loaders.length > 0
    fabricStatus = fabric ? 'supported' : 'unsupported'
  } catch (error) {
    if (Number(error.status) === 404 || isLegacyPreFabricRelease(id)) {
      fabric = false
      fabricStatus = 'unsupported'
      loaders = []
    } else {
      fabric = null
      fabricStatus = 'unknown'
      loaders = []
    }
  }

  const value = {
    version: id,
    type: manifestEntry.type,
    vanilla: true,
    fabric,
    fabricStatus,
    loaders,
    modrinth: fabric === true,
    stellarGui: 'catalog',
    fallback: fabric === false ? 'vanilla' : 'none',
    message: fabric === false
      ? `Minecraft ${id} resta disponibile in modalità Vanilla. Fabric, Modrinth e le GUI Stellar non sono disponibili per questa versione.`
      : (fabric === true
          ? `Minecraft ${id} supporta Fabric. Le GUI Stellar vengono caricate solo se esiste un modulo Stellar Core compatibile.`
          : `Compatibilità Fabric non verificabile al momento. Puoi comunque avviare Minecraft Vanilla ${id}.`)
  }
  versionCapabilityCache.set(id, { cachedAt: Date.now(), value })
  return value
}

async function normalizeLoaderForVersion (settings, persist = false) {
  if (settings.loader !== 'fabric') return { settings, capability: await getVersionCapabilities(settings.selectedVersion), changed: false }
  const capability = await getVersionCapabilities(settings.selectedVersion)
  if (capability.fabric !== false) return { settings, capability, changed: false }
  const next = sanitizeSettings({ ...settings, loader: 'vanilla', loaderVersion: 'latest' })
  const saved = persist ? await saveSettings(next) : next
  return { settings: saved, capability, changed: true }
}

async function getFabricLoaderInfo (gameVersion, requestedVersion = 'latest') {
  const list = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}`, {}, `Fabric Loader per ${gameVersion}`)
  if (!Array.isArray(list) || list.length === 0) throw new Error(`Fabric non supporta Minecraft ${gameVersion}.`)
  if (requestedVersion && requestedVersion !== 'latest') {
    const exact = list.find(item => item.loader && item.loader.version === requestedVersion)
    if (!exact) throw new Error(`Fabric Loader ${requestedVersion} non è compatibile con Minecraft ${gameVersion}.`)
    return exact
  }
  return list.find(item => item.loader && item.loader.stable) || list[0]
}

async function ensureFabricProfile (settings, root) {
  const info = await getFabricLoaderInfo(settings.selectedVersion, settings.loaderVersion)
  const loaderVersion = info.loader.version
  const profile = await fetchJson(
    `${FABRIC_META}/versions/loader/${encodeURIComponent(settings.selectedVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`,
    {},
    'Profilo Fabric'
  )
  if (!profile || !profile.id || !profile.inheritsFrom) throw new Error('Profilo Fabric non valido.')
  const profileDir = path.join(root, 'versions', profile.id)
  await fsp.mkdir(profileDir, { recursive: true })
  await fsp.writeFile(path.join(profileDir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf8')
  return { profileId: profile.id, loaderVersion }
}

async function loadVersionJsonById (versionId, root) {
  const localPath = path.join(root, 'versions', versionId, `${versionId}.json`)
  if (await pathExists(localPath)) return readJsonFile(localPath)
  const manifest = await getVersionManifest()
  const entry = manifest.versions.find(item => item.id === versionId)
  if (!entry) throw new Error(`Metadati versione non trovati: ${versionId}`)
  await downloadFile({ url: entry.url, dest: localPath, sha1: entry.sha1, label: `metadati ${versionId}` })
  return readJsonFile(localPath)
}

function libraryIdentity (library) {
  const parts = String(library && library.name || '').split(':')
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}${parts[3] ? `:${parts[3]}` : ''}` : String(library && library.name || crypto.randomUUID())
}

function mergeLibraries (baseLibraries = [], overlayLibraries = []) {
  const merged = new Map()
  for (const library of baseLibraries) merged.set(libraryIdentity(library), library)
  for (const library of overlayLibraries) merged.set(libraryIdentity(library), library)
  return [...merged.values()]
}

function mergeArguments (baseArguments, overlayArguments) {
  if (!baseArguments && !overlayArguments) return undefined
  return {
    game: [...((baseArguments && baseArguments.game) || []), ...((overlayArguments && overlayArguments.game) || [])],
    jvm: [...((baseArguments && baseArguments.jvm) || []), ...((overlayArguments && overlayArguments.jvm) || [])]
  }
}

function mergeVersionJson (base, overlay) {
  return {
    ...base,
    ...overlay,
    id: overlay.id || base.id,
    libraries: mergeLibraries(base.libraries, overlay.libraries),
    arguments: mergeArguments(base.arguments, overlay.arguments),
    downloads: overlay.downloads || base.downloads,
    assetIndex: overlay.assetIndex || base.assetIndex,
    assets: overlay.assets || base.assets,
    logging: overlay.logging || base.logging,
    javaVersion: overlay.javaVersion || base.javaVersion,
    type: overlay.type || base.type
  }
}

async function resolveVersionTree (versionId, root, seen = new Set()) {
  if (seen.has(versionId)) throw new Error(`Ereditarietà versione circolare: ${versionId}`)
  seen.add(versionId)
  const current = await loadVersionJsonById(versionId, root)
  if (!current.inheritsFrom) return { effective: current, base: current, leaf: current }
  const parent = await resolveVersionTree(current.inheritsFrom, root, seen)
  return { effective: mergeVersionJson(parent.effective, current), base: parent.base, leaf: current }
}

function artifactFromMavenName (library) {
  const raw = String(library && library.name || '')
  const extensionSplit = raw.split('@')
  const extension = extensionSplit[1] || 'jar'
  const parts = extensionSplit[0].split(':')
  if (parts.length < 3) return null
  const [group, artifact, version, classifier] = parts
  const filename = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  const relativePath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${filename}`
  const baseUrl = String(library.url || 'https://libraries.minecraft.net/').replace(/\/?$/, '/')
  return { path: relativePath, url: `${baseUrl}${relativePath}` }
}

async function pathExists (target) {
  if (!target) return false
  try { await fsp.access(target, fs.constants.F_OK); return true } catch { return false }
}

async function collectJavaExecutables (root, maxDepth = 8, limit = 40) {
  if (!root || !(await pathExists(root))) return []
  const queue = [{ dir: root, depth: 0 }]
  const results = []
  while (queue.length && results.length < limit) {
    const { dir, depth } = queue.shift()
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
    const executables = entries.filter(entry => entry.isFile() && (/^javaw\.exe$/i.test(entry.name) || /^java(\.exe)?$/i.test(entry.name)))
    executables.sort((a, b) => Number(/^javaw/i.test(b.name)) - Number(/^javaw/i.test(a.name)))
    for (const entry of executables) results.push(path.join(dir, entry.name))
    for (const entry of entries) {
      if (entry.isDirectory() && depth < maxDepth && !/^(logs|assets|libraries|versions|natives|cache|node_modules)$/i.test(entry.name)) {
        queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
      }
    }
  }
  return results
}

async function walkForJava (root, maxDepth = 8) {
  return (await collectJavaExecutables(root, maxDepth, 1))[0] || ''
}

async function discoverJava (requiredMajor = 0) {
  const candidates = []
  const add = value => {
    const normalized = String(value || '').trim()
    if (normalized && !candidates.some(item => item.toLowerCase() === normalized.toLowerCase())) candidates.push(normalized)
  }
  const executable = process.platform === 'win32' ? 'where.exe' : 'which'
  for (const lookupName of (process.platform === 'win32' ? ['javaw.exe', 'java.exe'] : ['java'])) {
    try {
      const { stdout } = await execFileAsync(executable, [lookupName], { timeout: 5000, windowsHide: true })
      stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(add)
    } catch {}
  }

  const roots = []
  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)']
    const pf = process.env.ProgramFiles
    const appData = process.env.APPDATA
    const local = process.env.LOCALAPPDATA
    roots.push(
      pf86 && path.join(pf86, 'Minecraft Launcher', 'runtime'),
      pf && path.join(pf, 'Minecraft Launcher', 'runtime'),
      appData && path.join(appData, '.minecraft', 'runtime'),
      local && path.join(local, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
      pf && path.join(pf, 'Eclipse Adoptium'),
      pf && path.join(pf, 'Java'),
      pf86 && path.join(pf86, 'Java')
    )
  } else if (process.platform === 'darwin') {
    roots.push('/Applications/Minecraft.app/Contents/runtime', '/Library/Java/JavaVirtualMachines')
  } else {
    roots.push('/usr/lib/jvm', path.join(os.homedir(), '.minecraft', 'runtime'))
  }
  for (const root of roots.filter(Boolean)) {
    for (const candidate of await collectJavaExecutables(root, 8, 40)) add(candidate)
  }
  const existing = []
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue
    const major = await detectJavaMajor(candidate)
    if (major) existing.push({ path: candidate, major })
  }
  if (!existing.length) return ''
  if (!requiredMajor) return existing[0].path
  const exact = existing.find(item => item.major === requiredMajor)
  if (exact) return exact.path
  const compatible = existing
    .filter(item => item.major > requiredMajor)
    .sort((a, b) => a.major - b.major)[0]
  return compatible ? compatible.path : ''
}

function currentOsName () {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

function ruleMatches (rule, features) {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== currentOsName()) return false
    if (rule.os.arch) {
      const arch = process.arch === 'ia32' ? 'x86' : process.arch
      if (rule.os.arch !== arch) return false
    }
    if (rule.os.version) {
      try { if (!(new RegExp(rule.os.version)).test(os.release())) return false } catch { return false }
    }
  }
  if (rule.features) {
    for (const [name, expected] of Object.entries(rule.features)) {
      if (Boolean(features[name]) !== Boolean(expected)) return false
    }
  }
  return true
}

function rulesAllow (rules, features = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}

function substitute (value, vars) {
  return String(value).replace(/\$\{([^}]+)\}/g, (_match, key) => Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : '')
}

function expandArguments (entries, features, vars) {
  const out = []
  for (const entry of entries || []) {
    if (typeof entry === 'string') {
      out.push(substitute(entry, vars))
      continue
    }
    if (!entry || !rulesAllow(entry.rules, features)) continue
    const values = Array.isArray(entry.value) ? entry.value : [entry.value]
    for (const value of values) out.push(substitute(value, vars))
  }
  return out
}

function splitLegacyArguments (input) {
  const result = []
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g
  let match
  while ((match = regex.exec(input || ''))) result.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'])/g, '$1'))
  return result
}

async function hashFile (filePath, algorithm = 'sha512') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const input = fs.createReadStream(filePath)
    input.on('data', chunk => hash.update(chunk))
    input.on('error', reject)
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

async function verifyFile (filePath, task = {}) {
  let stat
  try { stat = await fsp.stat(filePath) } catch { return false }
  if (task.size && stat.size !== Number(task.size)) return false
  const expectedSha512 = String(task.sha512 || '').trim().toLowerCase()
  const expectedSha1 = String(task.sha1 || '').trim().toLowerCase()
  if (expectedSha512 && (await hashFile(filePath, 'sha512')).toLowerCase() !== expectedSha512) return false
  if (!expectedSha512 && expectedSha1 && (await hashFile(filePath, 'sha1')).toLowerCase() !== expectedSha1) return false
  return true
}

async function downloadFile (task) {
  await fsp.mkdir(path.dirname(task.dest), { recursive: true })
  if (await verifyFile(task.dest, task)) return { skipped: true, verified: true }

  if (!/^https:\/\//i.test(task.url)) throw new Error(`URL download non sicuro: ${task.url}`)
  const temp = `${task.dest}.stellar-download-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  await fsp.rm(temp, { force: true }).catch(() => {})
  try {
    const response = await fetch(task.url, {
      headers: { 'User-Agent': STELLAR_USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok || !response.body) throw new Error(`Download fallito (${response.status}): ${task.label || path.basename(task.dest)}`)
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp, { flags: 'wx' }))
    if (!(await verifyFile(temp, task))) throw new Error(`Controllo integrità fallito per ${task.label || path.basename(task.dest)}.`)
    await fsp.rm(task.dest, { force: true }).catch(() => {})
    await fsp.rename(temp, task.dest)
    return { skipped: false, verified: true }
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {})
  }
}

async function downloadMany (tasks, type, concurrency = 10) {
  const unique = [...new Map(tasks.map(task => [task.dest, task])).values()]
  let cursor = 0
  let completed = 0
  const total = unique.length
  if (total === 0) return

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= total) return
      const task = unique[index]
      await downloadFile(task)
      completed++
      sendToRenderer('minecraft:event', {
        type: 'download-status',
        payload: { current: completed, total, name: task.label || path.basename(task.dest), type }
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
}

async function readJsonFile (filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'))
}

async function prepareMinecraftVersion (settings, root, features) {
  const gameVersion = settings.selectedVersion
  let launchVersionId = gameVersion
  let resolvedLoaderVersion = ''
  if (settings.loader === 'fabric') {
    sendToRenderer('minecraft:state', { status: 'starting', message: `Preparazione Fabric per ${gameVersion}…` })
    const fabric = await ensureFabricProfile(settings, root)
    launchVersionId = fabric.profileId
    resolvedLoaderVersion = fabric.loaderVersion
  }

  sendToRenderer('minecraft:state', { status: 'starting', message: `Recupero metadati ${launchVersionId}…` })
  const resolved = await resolveVersionTree(launchVersionId, root)
  const version = resolved.effective
  const baseVersion = resolved.base
  const baseVersionId = baseVersion.id || gameVersion

  const baseVersionDir = path.join(root, 'versions', baseVersionId)
  const clientJar = path.join(baseVersionDir, `${baseVersionId}.jar`)
  const clientDownload = baseVersion.downloads && baseVersion.downloads.client
  if (!clientDownload) throw new Error('Il manifest non contiene il file client Minecraft.')
  await downloadMany([{
    url: clientDownload.url,
    dest: clientJar,
    sha1: clientDownload.sha1,
    size: clientDownload.size,
    label: `Minecraft ${baseVersionId}`
  }], 'Client', 1)

  const libraries = []
  const nativeJars = []
  const libraryTasks = []
  const libraryRoot = path.join(root, 'libraries')
  for (const library of version.libraries || []) {
    if (!rulesAllow(library.rules, features)) continue
    let artifact = library.downloads && library.downloads.artifact
    if (!artifact) artifact = artifactFromMavenName(library)
    if (artifact && artifact.path && artifact.url) {
      const dest = path.join(libraryRoot, ...artifact.path.split('/'))
      libraries.push(dest)
      libraryTasks.push({ url: artifact.url, dest, sha1: artifact.sha1, size: artifact.size, label: library.name })
    }
    const nativePattern = library.natives && library.natives[currentOsName()]
    if (nativePattern && library.downloads && library.downloads.classifiers) {
      const archToken = process.arch === 'x64' ? '64' : '32'
      const classifierName = nativePattern.replace('${arch}', archToken)
      const classifier = library.downloads.classifiers[classifierName]
      if (classifier && classifier.path && classifier.url) {
        const dest = path.join(libraryRoot, ...classifier.path.split('/'))
        nativeJars.push({ path: dest, excludes: (library.extract && library.extract.exclude) || [] })
        libraryTasks.push({ url: classifier.url, dest, sha1: classifier.sha1, size: classifier.size, label: `${library.name} natives` })
      }
    }
  }
  await downloadMany(libraryTasks, 'Librerie', 8)

  const assetIndex = baseVersion.assetIndex
  if (!assetIndex || !assetIndex.url) throw new Error('Indice risorse Minecraft mancante.')
  const assetIndexPath = path.join(root, 'assets', 'indexes', `${assetIndex.id}.json`)
  await downloadFile({ url: assetIndex.url, dest: assetIndexPath, sha1: assetIndex.sha1, size: assetIndex.size, label: `asset index ${assetIndex.id}` })
  const assets = await readJsonFile(assetIndexPath)
  const assetTasks = []
  for (const [assetName, object] of Object.entries(assets.objects || {})) {
    assetTasks.push({
      url: `https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`,
      dest: path.join(root, 'assets', 'objects', object.hash.slice(0, 2), object.hash),
      sha1: object.hash,
      size: object.size,
      label: assetName
    })
  }
  await downloadMany(assetTasks, 'Risorse', 14)

  let loggingPath = ''
  if (baseVersion.logging && baseVersion.logging.client && baseVersion.logging.client.file) {
    const file = baseVersion.logging.client.file
    loggingPath = path.join(root, 'assets', 'log_configs', file.id)
    await downloadMany([{ url: file.url, dest: loggingPath, sha1: file.sha1, size: file.size, label: file.id }], 'Logging', 1)
  }

  const nativesDir = path.join(root, 'natives', launchVersionId)
  await extractNatives(nativeJars, nativesDir)
  const gameRoot = instanceRootFor(settings)
  await fsp.mkdir(path.join(gameRoot, 'mods'), { recursive: true })
  return {
    version,
    baseVersion,
    launchVersionId,
    resolvedLoaderVersion,
    clientJar,
    libraries,
    nativesDir,
    assetIndex,
    loggingPath,
    libraryRoot,
    sharedRoot: root,
    gameRoot
  }
}

function psQuote (value) { return `'${String(value).replace(/'/g, "''")}'` }

async function extractNatives (nativeJars, nativesDir) {
  const signature = crypto.createHash('sha1').update(nativeJars.map(item => item.path).join('|')).digest('hex')
  const marker = path.join(nativesDir, '.stellar-native-set')
  try {
    if ((await fsp.readFile(marker, 'utf8')) === signature) return
  } catch {}

  await fsp.rm(nativesDir, { recursive: true, force: true })
  await fsp.mkdir(nativesDir, { recursive: true })
  for (const native of nativeJars) {
    if (process.platform === 'win32') {
      try {
        await execFileAsync('tar.exe', ['-xf', native.path, '-C', nativesDir], { windowsHide: true, timeout: 60000 })
      } catch {
        const tempZip = `${native.path}.zip`
        await fsp.copyFile(native.path, tempZip)
        try {
          const command = `Expand-Archive -LiteralPath ${psQuote(tempZip)} -DestinationPath ${psQuote(nativesDir)} -Force`
          await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, timeout: 120000 })
        } finally {
          await fsp.rm(tempZip, { force: true }).catch(() => {})
        }
      }
    } else {
      await execFileAsync('unzip', ['-oq', native.path, '-d', nativesDir], { timeout: 60000 })
    }
    for (const excluded of native.excludes) {
      await fsp.rm(path.join(nativesDir, ...excluded.split('/')), { recursive: true, force: true }).catch(() => {})
    }
  }
  await fsp.rm(path.join(nativesDir, 'META-INF'), { recursive: true, force: true }).catch(() => {})
  await fsp.writeFile(marker, signature, 'utf8')
}

async function detectJavaMajor (javaPath) {
  const consoleJava = /javaw\.exe$/i.test(javaPath) ? javaPath.replace(/javaw\.exe$/i, 'java.exe') : javaPath
  try {
    const { stderr, stdout } = await execFileAsync(consoleJava, ['-version'], { windowsHide: true, timeout: 10000 })
    const text = `${stderr || ''}\n${stdout || ''}`
    const match = text.match(/version\s+"(\d+)(?:\.(\d+))?/i)
    if (!match) return null
    return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1])
  } catch {
    return null
  }
}

function buildLaunchArguments (prepared, identity, settings) {
  const { version, clientJar, libraries, nativesDir, assetIndex, loggingPath, libraryRoot, sharedRoot, gameRoot, launchVersionId } = prepared
  const classpath = [...libraries, clientJar].join(path.delimiter)
  const features = {
    has_custom_resolution: true,
    is_demo_user: false,
    has_quick_plays_support: Boolean(settings.serverAddress),
    is_quick_play_multiplayer: Boolean(settings.serverAddress),
    is_quick_play_singleplayer: false,
    is_quick_play_realms: false
  }
  const vars = {
    auth_player_name: identity.profile.name,
    version_name: launchVersionId || settings.selectedVersion,
    game_directory: gameRoot,
    assets_root: path.join(sharedRoot, 'assets'),
    assets_index_name: assetIndex.id,
    auth_uuid: identity.profile.id,
    auth_access_token: identity.token,
    auth_session: `token:${identity.token}:${identity.profile.id}`,
    clientid: authMode(settings).clientId,
    auth_xuid: identity.xuid || '',
    user_type: 'msa',
    version_type: version.type || settings.versionType,
    user_properties: '{}',
    natives_directory: nativesDir,
    launcher_name: 'stellar-client',
    launcher_version: app.getVersion(),
    classpath,
    classpath_separator: path.delimiter,
    library_directory: libraryRoot,
    resolution_width: settings.windowWidth,
    resolution_height: settings.windowHeight,
    game_assets: path.join(sharedRoot, 'assets', 'virtual', 'legacy')
  }

  let jvmArgs
  let gameArgs
  if (version.arguments) {
    jvmArgs = expandArguments(version.arguments.jvm || [], features, vars)
    gameArgs = expandArguments(version.arguments.game || [], features, vars)
  } else {
    jvmArgs = [`-Djava.library.path=${nativesDir}`, '-cp', classpath]
    gameArgs = splitLegacyArguments(version.minecraftArguments).map(arg => substitute(arg, vars))
  }

  if (loggingPath && version.logging && version.logging.client && version.logging.client.argument) {
    jvmArgs.push(substitute(version.logging.client.argument, { path: loggingPath }))
  }
  if (!jvmArgs.some(arg => arg === '-cp' || arg === '-classpath')) jvmArgs.push('-cp', classpath)

  const memoryArgs = [`-Xms${settings.memoryMinGb}G`, `-Xmx${settings.memoryMaxGb}G`]
  const customJvm = [
    '-Dfile.encoding=UTF-8',
    '-Dlauncher.brand=stellar-client',
    `-Dlauncher.version=${app.getVersion()}`,
    `-Dstellar.theme=${sanitizeFilePart(settings.theme)}`,
    `-Dstellar.storeUrl=${settings.storeUrl || 'https://stellarclient.it/store'}`,
    `-Dstellar.socialUrl=${settings.friendsServiceUrl || ''}`,
    `-Dstellar.discordName=${settings.discordAccount?.globalName || settings.discordAccount?.username || ''}`
  ]

  if (settings.serverAddress) {
    const address = settings.serverAddress.trim()
    const ipv6 = address.startsWith('[')
    let host = address
    let port = ''
    if (!ipv6 && address.includes(':')) {
      const parts = address.split(':')
      port = parts.pop()
      host = parts.join(':')
    }
    gameArgs.push('--server', host)
    if (/^\d{1,5}$/.test(port)) gameArgs.push('--port', port)
  }

  return [...memoryArgs, ...customJvm, ...jvmArgs, version.mainClass, ...gameArgs]
}

async function launchMinecraftProcess (identity, settings, javaPath, root) {
  const features = { has_custom_resolution: true, is_demo_user: false }
  const prepared = await prepareMinecraftVersion(settings, root, features)
  const declaredJava = Number(prepared.version.javaVersion && prepared.version.javaVersion.majorVersion)
  const requiredJava = declaredJava || (isLegacyPreFabricRelease(settings.selectedVersion) ? 8 : 8)
  let effectiveJavaPath = javaPath
  let detectedJava = await detectJavaMajor(effectiveJavaPath)
  const needsDifferentRuntime = !detectedJava || detectedJava < requiredJava || (requiredJava === 8 && detectedJava !== 8)
  if (needsDifferentRuntime) {
    const compatible = await discoverJava(requiredJava)
    if (compatible) {
      effectiveJavaPath = compatible
      detectedJava = await detectJavaMajor(effectiveJavaPath)
    }
  }
  if (!detectedJava || detectedJava < requiredJava || (requiredJava === 8 && detectedJava !== 8)) {
    throw new Error(`Minecraft ${settings.selectedVersion} richiede un runtime Java ${requiredJava} compatibile. Selezionalo nelle Impostazioni o installalo sul PC.`)
  }

  const args = buildLaunchArguments(prepared, identity, settings)
  sendToRenderer('minecraft:event', { type: 'arguments', payload: `Avvio con ${args.length} argomenti.` })
  await setDiscordPresence(settings, 'playing', settings.serverAddress ? `Server: ${settings.serverAddress}` : 'Minecraft Java')
  const child = spawn(effectiveJavaPath, args, {
    cwd: prepared.gameRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  if (child.stdout) child.stdout.on('data', chunk => sendToRenderer('minecraft:event', { type: 'data', payload: chunk.toString().slice(0, 4000) }))
  if (child.stderr) child.stderr.on('data', chunk => sendToRenderer('minecraft:event', { type: 'data', payload: chunk.toString().slice(0, 4000) }))
  child.on('error', error => {
    launchInProgress = false
    activeGameProcess = null
    sendToRenderer('minecraft:state', { status: 'error', message: safeError(error) })
  })
  child.on('close', code => {
    launchInProgress = false
    activeGameProcess = null
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
    setDiscordPresence(settings, 'launcher', 'Minecraft chiuso').catch(() => {})
    sendToRenderer('minecraft:state', {
      status: 'closed',
      message: code === 0 ? 'Minecraft chiuso correttamente.' : `Minecraft si è chiuso con codice ${code}.`,
      code
    })
  })
  child.stellarJavaPath = effectiveJavaPath
  child.stellarRequiredJava = requiredJava
  return child
}


async function listFabricLoaders (gameVersion) {
  const list = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}`, {}, `Fabric Loader per ${gameVersion}`)
  return (Array.isArray(list) ? list : []).slice(0, 30).map(item => ({
    version: item.loader.version,
    stable: Boolean(item.loader.stable)
  }))
}

async function readModManifest (settings) {
  await ensureInstanceLayout(settings)
  const manifestPath = modManifestPathFor(settings)
  const legacyPath = legacyModManifestPathFor(settings)
  if (!(await pathExists(manifestPath)) && await pathExists(legacyPath)) {
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
    await fsp.rename(legacyPath, manifestPath).catch(async () => {
      await fsp.copyFile(legacyPath, manifestPath)
      await fsp.rm(legacyPath, { force: true })
    })
  }
  try {
    const parsed = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('Manifest mod non valido.')
    return { schema: 3, createdAt: parsed.createdAt || new Date().toISOString(), ...parsed, items: parsed.items }
  } catch {
    return { schema: 3, createdAt: new Date().toISOString(), items: [] }
  }
}

async function writeModManifest (settings, manifest) {
  const manifestPath = modManifestPathFor(settings)
  await ensureInstanceLayout(settings)
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true })
  const payload = { ...manifest, schema: 3, updatedAt: new Date().toISOString() }
  const temp = `${manifestPath}.${process.pid}.tmp`
  await fsp.writeFile(temp, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fsp.rename(temp, manifestPath)
}

function modPathsForRecord (record, settings) {
  const paths = instancePathsFor(settings)
  const fileName = path.basename(record.fileName || '')
  return {
    active: path.join(paths.mods, fileName),
    disabled: path.join(paths.disabledMods, fileName),
    legacyDisabled: path.join(paths.mods, `${fileName}.disabled`)
  }
}

function normalizeModRecord (record, settings) {
  const locations = modPathsForRecord(record, settings)
  return {
    ...record,
    enabled: fs.existsSync(locations.active),
    present: fs.existsSync(locations.active) || fs.existsSync(locations.disabled) || fs.existsSync(locations.legacyDisabled)
  }
}

async function listInstalledMods (settings) {
  const manifest = await readModManifest(settings)
  return manifest.items.map(item => normalizeModRecord(item, settings))
}

async function searchModrinth (query = {}) {
  const gameVersion = String(query.gameVersion || DEFAULT_SETTINGS.selectedVersion)
  const loader = String(query.loader || 'fabric')
  if (loader !== 'fabric') throw new Error('Il catalogo mod è disponibile solo nei profili Fabric.')
  const capability = await getVersionCapabilities(gameVersion)
  if (capability.fabric === false) throw new Error(`Fabric non è disponibile per Minecraft ${gameVersion}. Usa il profilo Vanilla.`)
  const facets = [
    ['project_type:mod'],
    ['categories:fabric'],
    [`versions:${gameVersion}`]
  ]
  const params = new URLSearchParams({
    query: String(query.query || '').slice(0, 120),
    limit: String(clampNumber(query.limit, 1, 40, 20)),
    offset: String(clampNumber(query.offset, 0, 10000, 0)),
    index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(query.index) ? query.index : 'relevance',
    facets: JSON.stringify(facets)
  })
  const result = await fetchJson(`${MODRINTH_API}/search?${params}`, {}, 'Ricerca Modrinth')
  return {
    totalHits: Number(result.total_hits || 0),
    offset: Number(result.offset || 0),
    limit: Number(result.limit || 20),
    hits: (result.hits || []).map(hit => ({
      projectId: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || '',
      downloads: Number(hit.downloads || 0),
      follows: Number(hit.follows || 0),
      dateModified: hit.date_modified,
      categories: hit.categories || [],
      versions: hit.versions || []
    }))
  }
}

async function getModrinthProject (projectId) {
  return fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`, {}, 'Progetto Modrinth')
}

async function getCompatibleModrinthVersion (projectId, settings) {
  const params = new URLSearchParams({
    loaders: JSON.stringify(['fabric']),
    game_versions: JSON.stringify([settings.selectedVersion])
  })
  const versions = await fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?${params}`, {}, 'Versioni Modrinth')
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`Nessuna versione compatibile con Minecraft ${settings.selectedVersion} e Fabric.`)
  }
  return versions.find(version => version.version_type === 'release' && Array.isArray(version.files) && version.files.length > 0) || versions.find(version => Array.isArray(version.files) && version.files.length > 0)
}

async function getModrinthVersionById (versionId) {
  return fetchJson(`${MODRINTH_API}/version/${encodeURIComponent(versionId)}`, {}, 'Versione Modrinth')
}

function chooseModFile (version) {
  const files = Array.isArray(version.files) ? version.files : []
  return files.find(file => file.primary && /\.jar$/i.test(file.filename)) || files.find(file => /\.jar$/i.test(file.filename)) || files[0]
}

function isVersionCompatibleWithProfile (version, settings) {
  const loaders = Array.isArray(version.loaders) ? version.loaders : []
  const gameVersions = Array.isArray(version.game_versions) ? version.game_versions : []
  return loaders.includes('fabric') && gameVersions.includes(settings.selectedVersion)
}

function installedDependencyRecord (dependency, manifest) {
  return manifest.items.find(item =>
    (dependency.project_id && item.projectId === dependency.project_id) ||
    (dependency.version_id && item.versionId === dependency.version_id)
  )
}

async function resolveModrinthDependencyVersion (dependency, settings) {
  if (dependency.version_id) {
    const version = await getModrinthVersionById(dependency.version_id)
    if (!isVersionCompatibleWithProfile(version, settings)) {
      throw new Error(`Una dipendenza richiesta non è compatibile con Minecraft ${settings.selectedVersion} e Fabric.`)
    }
    return version
  }
  if (dependency.project_id) return getCompatibleModrinthVersion(dependency.project_id, settings)
  return null
}

async function backupFileForTransaction (filePath, context) {
  if (!(await pathExists(filePath))) return false
  await fsp.mkdir(context.backupRoot, { recursive: true })
  const backup = path.join(context.backupRoot, `${path.basename(filePath)}.${context.transactionId}.bak`)
  await fsp.rm(backup, { force: true }).catch(() => {})
  await fsp.rename(filePath, backup)
  context.backups.push({ backup, original: filePath })
  return true
}

async function installModrinthVersionRecursive (version, settings, context) {
  if (!version || !version.id || !version.project_id) throw new Error('Versione Modrinth non valida.')
  if (!isVersionCompatibleWithProfile(version, settings)) {
    throw new Error(`La versione selezionata non supporta Minecraft ${settings.selectedVersion} con Fabric.`)
  }
  if (context.visited.has(version.id)) return
  context.visited.add(version.id)

  for (const dependency of version.dependencies || []) {
    if (dependency.dependency_type !== 'incompatible') continue
    const conflict = installedDependencyRecord(dependency, context.manifest)
    if (conflict) throw new Error(`${version.name || version.id} è incompatibile con ${conflict.title || conflict.slug || conflict.projectId}.`)
  }

  for (const dependency of version.dependencies || []) {
    if (dependency.dependency_type === 'optional') {
      context.optionalDependencies.push({ projectId: dependency.project_id || '', versionId: dependency.version_id || '' })
      continue
    }
    if (dependency.dependency_type !== 'required') continue
    const dependencyVersion = await resolveModrinthDependencyVersion(dependency, settings)
    if (dependencyVersion) await installModrinthVersionRecursive(dependencyVersion, settings, context)
  }

  const projectId = version.project_id
  const project = await getModrinthProject(projectId)
  if (project.project_type && project.project_type !== 'mod') throw new Error(`${project.title || projectId} non è una mod.`)
  if (project.client_side === 'unsupported') {
    throw new Error(`${project.title || projectId} non è una mod client e non può essere installata in Stellar Client.`)
  }
  const file = chooseModFile(version)
  if (!file || !file.url || !file.filename || !/\.jar$/i.test(file.filename)) {
    throw new Error(`Il progetto ${project.title || projectId} non contiene una JAR installabile.`)
  }
  const safeName = path.basename(file.filename).replace(/[^0-9A-Za-z._+()\- ]/g, '_')
  const paths = await ensureInstanceLayout(settings)
  const modsRoot = paths.mods
  const destination = path.join(modsRoot, safeName)
  const collision = context.manifest.items.find(item => item.fileName === safeName && item.projectId !== projectId)
  if (collision) throw new Error(`Conflitto file: ${safeName} è già usato da ${collision.title || collision.projectId}.`)

  const task = {
    url: file.url,
    dest: destination,
    sha512: file.hashes && file.hashes.sha512,
    sha1: file.hashes && file.hashes.sha1,
    size: file.size,
    label: project.title || safeName
  }
  const alreadyValid = await verifyFile(destination, task)
  if (!alreadyValid && await pathExists(destination)) await backupFileForTransaction(destination, context)
  if (!alreadyValid) context.createdPaths.add(destination)

  sendToRenderer('mods:event', { type: 'progress', payload: { title: project.title, message: `Download verificato ${safeName}…` } })
  await downloadFile(task)

  const previous = context.manifest.items.find(item => item.projectId === projectId)
  if (previous && previous.fileName && previous.fileName !== safeName) {
    context.obsoletePaths.add(path.join(modsRoot, previous.fileName))
    context.obsoletePaths.add(path.join(paths.disabledMods, previous.fileName))
    context.obsoletePaths.add(path.join(modsRoot, `${previous.fileName}.disabled`))
  }
  const record = {
    projectId,
    slug: project.slug || projectId,
    title: project.title || projectId,
    description: project.description || '',
    iconUrl: project.icon_url || '',
    license: project.license && (project.license.name || project.license.id) ? String(project.license.name || project.license.id) : '',
    versionId: version.id,
    versionNumber: version.version_number || version.name || '',
    gameVersion: settings.selectedVersion,
    loader: 'fabric',
    fileName: safeName,
    fileSize: Number(file.size || 0),
    hashes: {
      sha512: String(file.hashes && file.hashes.sha512 || ''),
      sha1: String(file.hashes && file.hashes.sha1 || '')
    },
    installedAt: new Date().toISOString(),
    dependency: context.rootProjectId !== projectId,
    source: 'modrinth'
  }
  const index = context.manifest.items.findIndex(item => item.projectId === projectId)
  if (index >= 0) context.manifest.items[index] = record
  else context.manifest.items.push(record)
  context.installed.push(record)
}

async function rollbackModTransaction (context) {
  for (const filePath of context.createdPaths) await fsp.rm(filePath, { force: true }).catch(() => {})
  for (const item of [...context.backups].reverse()) {
    await fsp.rm(item.original, { force: true }).catch(() => {})
    if (await pathExists(item.backup)) await fsp.rename(item.backup, item.original).catch(() => {})
  }
}

async function commitModTransaction (context) {
  for (const item of context.backups) await fsp.rm(item.backup, { force: true }).catch(() => {})
  for (const filePath of context.obsoletePaths) await fsp.rm(filePath, { force: true }).catch(() => {})
}

async function installModrinthProject (projectId, requested, settings) {
  if (settings.loader !== 'fabric') throw new Error('Le mod richiedono un profilo Fabric.')
  const capability = await getVersionCapabilities(settings.selectedVersion)
  if (capability.fabric === false) throw new Error(`Minecraft ${settings.selectedVersion} non supporta Fabric: il profilo resta Vanilla.`)
  if (capability.fabric === null) throw new Error('Impossibile verificare ora la compatibilità Fabric. Riprova quando la connessione è disponibile.')
  if (!projectId || projectId.length > 80) throw new Error('ID progetto Modrinth non valido.')
  const version = requested && requested.versionId
    ? await getModrinthVersionById(requested.versionId)
    : await getCompatibleModrinthVersion(projectId, settings)
  const manifest = await readModManifest(settings)
  const paths = await ensureInstanceLayout(settings)
  const context = {
    manifest,
    backupRoot: paths.modBackups,
    visited: new Set(),
    installed: [],
    optionalDependencies: [],
    rootProjectId: version.project_id,
    transactionId: crypto.randomBytes(8).toString('hex'),
    createdPaths: new Set(),
    obsoletePaths: new Set(),
    backups: []
  }
  try {
    await installModrinthVersionRecursive(version, settings, context)
    await writeModManifest(settings, manifest)
    await commitModTransaction(context)
  } catch (error) {
    await rollbackModTransaction(context)
    throw error
  }
  sendToRenderer('mods:event', { type: 'complete', payload: { count: context.installed.length } })
  return context.installed.map(item => normalizeModRecord(item, settings))
}

async function auditInstalledMods (settings) {
  const manifest = await readModManifest(settings)
  const paths = await ensureInstanceLayout(settings)
  const results = []
  for (const record of manifest.items) {
    const locations = modPathsForRecord(record, settings)
    if (!(await pathExists(locations.disabled)) && await pathExists(locations.legacyDisabled)) {
      await fsp.rename(locations.legacyDisabled, locations.disabled).catch(() => {})
    }
    const filePath = await pathExists(locations.active) ? locations.active : (await pathExists(locations.disabled) ? locations.disabled : '')
    let status = 'missing'
    if (filePath) {
      const valid = await verifyFile(filePath, {
        size: record.fileSize,
        sha512: record.hashes && record.hashes.sha512,
        sha1: record.hashes && record.hashes.sha1
      })
      status = valid ? 'ok' : 'corrupt'
    }
    if (record.gameVersion && record.gameVersion !== settings.selectedVersion) status = 'wrong-version'
    if (record.loader && record.loader !== 'fabric') status = 'wrong-loader'
    results.push({ ...normalizeModRecord(record, settings), auditStatus: status })
  }
  return {
    ok: results.every(item => item.auditStatus === 'ok'),
    total: results.length,
    problems: results.filter(item => item.auditStatus !== 'ok').length,
    mods: results
  }
}

async function repairInstalledMods (settings) {
  const audit = await auditInstalledMods(settings)
  const repaired = []
  const failures = []
  for (const record of audit.mods.filter(item => item.auditStatus !== 'ok')) {
    try {
      const installed = await installModrinthProject(record.projectId, { versionId: record.versionId }, settings)
      repaired.push(...installed)
    } catch (error) {
      failures.push({ projectId: record.projectId, title: record.title, error: safeError(error) })
    }
  }
  return { repaired, failures, audit: await auditInstalledMods(settings) }
}

function validateCoreCatalogEntry (entry, settings) {
  return entry && entry.minecraft === settings.selectedVersion && entry.loader === 'fabric' &&
    typeof entry.url === 'string' && /^https:\/\//i.test(entry.url) &&
    typeof entry.fileName === 'string' && /^stellar-core-[0-9A-Za-z._+\-]+\.jar$/i.test(entry.fileName) &&
    entry.hashes && (entry.hashes.sha512 || entry.hashes.sha1)
}

async function ensureStellarCore (settings) {
  if (settings.loader !== 'fabric' || settings.autoInstallCore === false) return { installed: false, reason: 'disabled' }
  if (!/^https:\/\//i.test(settings.coreCatalogUrl || '')) return { installed: false, reason: 'catalog-not-configured' }
  const catalog = await fetchJson(settings.coreCatalogUrl, {}, 'Catalogo Stellar Core')
  const entries = Array.isArray(catalog.entries) ? catalog.entries : []
  const entry = entries.find(item => validateCoreCatalogEntry(item, settings))
  if (!entry) return { installed: false, reason: 'unsupported-version' }
  const paths = await ensureInstanceLayout(settings)
  const destination = path.join(paths.mods, path.basename(entry.fileName))
  sendToRenderer('minecraft:state', { status: 'starting', message: `Verifica Stellar Core per ${settings.selectedVersion}…` })
  await downloadFile({
    url: entry.url,
    dest: destination,
    size: entry.size,
    sha512: entry.hashes.sha512,
    sha1: entry.hashes.sha1,
    label: `Stellar Core ${settings.selectedVersion}`
  })
  const statePath = path.join(instanceRootFor(settings), '.stellar', 'core.json')
  await fsp.mkdir(path.dirname(statePath), { recursive: true })
  await fsp.writeFile(statePath, JSON.stringify({
    schema: 1,
    version: String(entry.version || ''),
    minecraft: settings.selectedVersion,
    loader: 'fabric',
    fileName: path.basename(entry.fileName),
    hashes: entry.hashes,
    installedAt: new Date().toISOString()
  }, null, 2), { encoding: 'utf8', mode: 0o600 })
  return { installed: true, fileName: path.basename(entry.fileName), version: String(entry.version || '') }
}

async function assertVanillaResourceProtection (settings) {
  if (settings.protectVanillaResources === false) return
  const instanceRoot = instanceRootFor(settings)
  const protectedNames = ['assets', 'libraries', 'versions']
  for (const name of protectedNames) {
    const candidate = path.join(instanceRoot, name)
    try {
      const stat = await fsp.lstat(candidate)
      if (stat.isSymbolicLink()) throw new Error(`Protezione risorse: ${name} non può essere un collegamento simbolico.`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

async function uninstallModrinthProject (projectId, settings) {
  const manifest = await readModManifest(settings)
  const index = manifest.items.findIndex(item => item.projectId === projectId)
  if (index < 0) return false
  const [record] = manifest.items.splice(index, 1)
  const locations = modPathsForRecord(record, settings)
  await fsp.rm(locations.active, { force: true }).catch(() => {})
  await fsp.rm(locations.disabled, { force: true }).catch(() => {})
  await fsp.rm(locations.legacyDisabled, { force: true }).catch(() => {})
  await writeModManifest(settings, manifest)
  return true
}

async function toggleInstalledMod (projectId, enabled, settings) {
  const manifest = await readModManifest(settings)
  const record = manifest.items.find(item => item.projectId === projectId)
  if (!record) throw new Error('Mod non trovata nel profilo corrente.')
  await ensureInstanceLayout(settings)
  const locations = modPathsForRecord(record, settings)
  if (enabled) {
    if (await pathExists(locations.disabled)) await fsp.rename(locations.disabled, locations.active)
    else if (await pathExists(locations.legacyDisabled)) await fsp.rename(locations.legacyDisabled, locations.active)
  } else if (await pathExists(locations.active)) {
    await fsp.rename(locations.active, locations.disabled)
  }
  return normalizeModRecord(record, settings)
}

const MOD_PRESETS = Object.freeze({
  performance: ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'dynamic-fps'],
  essential: ['fabric-api', 'modmenu', 'sodium', 'lithium', 'iris', 'zoomify'],
  pvp: ['sodium', 'lithium', 'immediatelyfast', 'entityculling', 'modmenu', 'zoomify']
})

async function installModPreset (preset, settings) {
  const projects = MOD_PRESETS[preset] || MOD_PRESETS.essential
  const installed = []
  const failures = []
  for (const slug of projects) {
    try {
      sendToRenderer('mods:event', { type: 'progress', payload: { title: slug, message: `Installazione ${slug}…` } })
      const result = await installModrinthProject(slug, {}, settings)
      installed.push(...result)
    } catch (error) {
      failures.push({ project: slug, error: safeError(error) })
    }
  }
  return { installed, failures }
}

async function readFriends () {
  try {
    const parsed = JSON.parse(await fsp.readFile(friendsPath(), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeFriends (friends) {
  await fsp.mkdir(path.dirname(friendsPath()), { recursive: true })
  await fsp.writeFile(friendsPath(), JSON.stringify(friends, null, 2), 'utf8')
}

async function addLocalFriend (name) {
  const clean = String(name || '').trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) throw new Error('Inserisci un nome Minecraft valido da 3 a 16 caratteri.')
  const friends = await readFriends()
  if (friends.some(friend => friend.name.toLowerCase() === clean.toLowerCase())) return friends
  friends.unshift({ id: crypto.randomUUID(), name: clean, status: 'offline', addedAt: new Date().toISOString() })
  await writeFriends(friends)
  return friends
}

async function removeLocalFriend (id) {
  const friends = await readFriends()
  const next = friends.filter(friend => friend.id !== id)
  await writeFriends(next)
  return next
}

const DEFAULT_ANNOUNCEMENTS = Object.freeze([
  {
    id: 'welcome-100',
    title: 'Stellar Client 1.0',
    body: 'Nuova interfaccia, profili Fabric, catalogo Modrinth con dipendenze automatiche e sorgenti Stellar Core.',
    tag: 'UPDATE',
    date: '2026-07-19'
  },
  {
    id: 'instances',
    title: 'Profili separati',
    body: 'Ogni versione mantiene mod, configurazioni e salvataggi in una cartella dedicata per evitare conflitti.',
    tag: 'CLIENT',
    date: '2026-07-19'
  },
  {
    id: 'social',
    title: 'Stellar Social',
    body: 'La pagina amici è pronta. Lo stato online condiviso richiede il servizio Stellar Social sul tuo server.',
    tag: 'SOCIAL',
    date: '2026-07-19'
  }
])

function serviceUrl (value, suffix = '') {
  const raw = String(value || '').trim().replace(/\/$/, '')
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) return ''
    return `${parsed.toString().replace(/\/$/, '')}${suffix}`
  } catch {
    return ''
  }
}

async function listAnnouncements (settings) {
  const endpoint = serviceUrl(settings.announcementsUrl)
  if (endpoint) {
    try {
      const remote = await fetchJson(endpoint, {}, 'Annunci Stellar')
      if (Array.isArray(remote)) return remote.slice(0, 30)
      if (remote && Array.isArray(remote.items)) return remote.items.slice(0, 30)
    } catch {}
  }
  return DEFAULT_ANNOUNCEMENTS
}

async function listRemoteFriends (settings) {
  const endpoint = serviceUrl(settings.friendsServiceUrl, `/friends?user=${encodeURIComponent(settings.account?.name || '')}`)
  if (!endpoint || !settings.account?.name) return null
  const payload = await fetchJson(endpoint, {}, 'Stellar Social')
  return Array.isArray(payload.friends) ? payload.friends : []
}

async function addRemoteFriend (settings, friend) {
  const endpoint = serviceUrl(settings.friendsServiceUrl, '/friends')
  if (!endpoint || !settings.account?.name) return null
  const session = await stellarDesktopSession(settings)
  const payload = await fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: JSON.stringify({ user: settings.account.name, friend })
  }, 'Stellar Social')
  return Array.isArray(payload.friends) ? payload.friends : []
}

async function removeRemoteFriend (settings, friend) {
  const base = serviceUrl(settings.friendsServiceUrl)
  if (!base || !settings.account?.name) return null
  const endpoint = `${base}/friends?user=${encodeURIComponent(settings.account.name)}&friend=${encodeURIComponent(friend)}`
  const session = await stellarDesktopSession(settings)
  const payload = await fetchJson(endpoint, { method: 'DELETE', headers: session ? { Authorization: `Bearer ${session.token}` } : {} }, 'Stellar Social')
  return Array.isArray(payload.friends) ? payload.friends : []
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#07070b',
    title: 'stellarClient',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
}

function registerIpc () {
  ipcMain.handle('app:get-info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }))
  ipcMain.handle('window:action', (_event, action) => {
    if (!mainWindow) return false
    if (action === 'minimize') mainWindow.minimize()
    if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    if (action === 'close') mainWindow.close()
    return true
  })
  ipcMain.handle('settings:get', async () => {
    const settings = await loadSettings()
    if (!settings.minecraftRoot) settings.minecraftRoot = defaultMinecraftRoot()
    return settings
  })
  ipcMain.handle('settings:save', async (_event, updates) => saveSettings(updates || {}))
  ipcMain.handle('versions:list', async () => fetchVersions())
  ipcMain.handle('versions:capabilities', async (_event, gameVersion) => {
    try { return { ok: true, ...(await getVersionCapabilities(String(gameVersion || DEFAULT_SETTINGS.selectedVersion))) } }
    catch (error) { return { ok: false, error: safeError(error), vanilla: true, fabric: null, modrinth: false, fallback: 'vanilla' } }
  })
  ipcMain.handle('fabric:loaders', async (_event, gameVersion) => {
    try { return { ok: true, loaders: await listFabricLoaders(String(gameVersion || DEFAULT_SETTINGS.selectedVersion)) } }
    catch (error) { return { ok: false, error: safeError(error), loaders: [] } }
  })
  ipcMain.handle('mods:search', async (_event, query) => {
    try { return { ok: true, ...(await searchModrinth(query || {})) } }
    catch (error) { return { ok: false, error: safeError(error), hits: [], totalHits: 0 } }
  })
  ipcMain.handle('mods:list-installed', async (_event, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: true, mods: await listInstalledMods(settings), instanceRoot: instanceRootFor(settings) }
    } catch (error) { return { ok: false, error: safeError(error), mods: [] } }
  })
  ipcMain.handle('mods:install', async (_event, projectId, requested = {}, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      const mods = await installModrinthProject(String(projectId || ''), requested || {}, settings)
      return { ok: true, mods }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })
  ipcMain.handle('mods:uninstall', async (_event, projectId, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: await uninstallModrinthProject(String(projectId || ''), settings) }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })
  ipcMain.handle('mods:toggle', async (_event, projectId, enabled, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: true, mod: await toggleInstalledMod(String(projectId || ''), Boolean(enabled), settings) }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })
  ipcMain.handle('mods:install-preset', async (_event, preset, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: true, ...(await installModPreset(String(preset || 'essential'), settings)) }
    } catch (error) { return { ok: false, error: safeError(error), installed: [], failures: [] } }
  })
  ipcMain.handle('mods:audit', async (_event, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: true, ...(await auditInstalledMods(settings)) }
    } catch (error) { return { ok: false, error: safeError(error), mods: [], problems: 0 } }
  })
  ipcMain.handle('mods:repair', async (_event, overrides = {}) => {
    try {
      const settings = sanitizeSettings({ ...(await loadSettings()), ...overrides })
      return { ok: true, ...(await repairInstalledMods(settings)) }
    } catch (error) { return { ok: false, error: safeError(error), repaired: [], failures: [] } }
  })
  ipcMain.handle('social:list', async () => {
    const settings = await loadSettings()
    const configured = Boolean(serviceUrl(settings.friendsServiceUrl))
    if (configured && settings.account?.name) {
      try { return { ok: true, friends: await listRemoteFriends(settings), serviceConfigured: true } } catch {}
    }
    return { ok: true, friends: await readFriends(), serviceConfigured: false }
  })
  ipcMain.handle('social:add', async (_event, name) => {
    try {
      const clean = String(name || '').trim()
      const settings = await loadSettings()
      if (serviceUrl(settings.friendsServiceUrl) && settings.account?.name) {
        return { ok: true, friends: await addRemoteFriend(settings, clean), serviceConfigured: true }
      }
      return { ok: true, friends: await addLocalFriend(clean), serviceConfigured: false }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })
  ipcMain.handle('social:remove', async (_event, id) => {
    try {
      const clean = String(id || '')
      const settings = await loadSettings()
      if (serviceUrl(settings.friendsServiceUrl) && settings.account?.name) {
        return { ok: true, friends: await removeRemoteFriend(settings, clean), serviceConfigured: true }
      }
      return { ok: true, friends: await removeLocalFriend(clean), serviceConfigured: false }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })
  ipcMain.handle('announcements:list', async () => {
    try { return { ok: true, items: await listAnnouncements(await loadSettings()) } }
    catch (error) { return { ok: false, error: safeError(error), items: DEFAULT_ANNOUNCEMENTS } }
  })

  ipcMain.handle('auth:login', async () => {
    try {
      sendToRenderer('auth:state', { status: 'working', message: 'Preparazione accesso Microsoft…' })
      const settings = await loadSettings()
      const identity = await getMinecraftIdentity(settings, true)
      const account = {
        id: identity.profile.id,
        name: identity.profile.name,
        skinUrl: identity.profile.skins && identity.profile.skins[0] ? identity.profile.skins[0].url : '',
        signedInAt: new Date().toISOString()
      }
      await saveSettings({ account })
      sendToRenderer('auth:state', { status: 'success', account })
      return { ok: true, account }
    } catch (error) {
      const message = safeError(error)
      sendToRenderer('auth:state', { status: 'error', message })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    try {
      if (currentAuthPollAbort) currentAuthPollAbort.cancelled = true
      await fsp.rm(authCachePath(), { force: true })
      await saveSettings({ account: null })
      return { ok: true }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('discord:status', async () => {
    try {
      const settings = await loadSettings()
      if (serviceUrl(settings.friendsServiceUrl)) {
        const profile = await clientProfile(settings).catch(() => null)
        if (profile?.discord?.id) {
          const account = discordAccountFromUser({ ...profile.discord, guildMember: profile.guildMember, isAdmin: profile.isAdmin })
          await saveSettings({ discordAccount: account })
          return { ok: true, connected: true, account, profile, mode: 'backend' }
        }
      }
      const token = await currentDiscordToken(settings).catch(() => null)
      if (!token) return { ok: true, connected: false, account: settings.discordAccount }
      const user = await fetchDiscordUser(token.accessToken)
      const account = discordAccountFromUser(user)
      await saveSettings({ discordAccount: account })
      return { ok: true, connected: true, account }
    } catch (error) {
      return { ok: false, connected: false, error: safeError(error) }
    }
  })

  ipcMain.handle('discord:login', async (_event, overrides = {}) => {
    try {
      const settings = await saveSettings(overrides || {})
      sendToRenderer('discord:state', { status: 'working', message: 'Preparazione collegamento Discord…' })
      const account = await loginDiscord(settings)
      sendToRenderer('discord:state', { status: 'success', message: `Discord collegato come ${account.globalName || account.username}.`, account })
      await setDiscordPresence(await loadSettings(), 'launcher', 'Discord collegato')
      return { ok: true, account }
    } catch (error) {
      const message = safeError(error)
      sendToRenderer('discord:state', { status: 'error', message })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('discord:logout', async () => {
    try {
      closeDiscordCallbackServer()
      await fsp.rm(discordAuthCachePath(), { force: true })
      discordRpc?.close()
      discordRpc = null
      await saveSettings({ discordAccount: null })
      return { ok: true }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('discord:invite-bot', async (_event, overrides = {}) => {
    try {
      const settings = await saveSettings(overrides || {})
      const url = discordBotInviteUrl(settings)
      await shell.openExternal(url)
      return { ok: true, url }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('discord:presence', async (_event, enabled) => {
    try {
      const settings = await saveSettings({ discordPresenceEnabled: Boolean(enabled) })
      if (settings.discordPresenceEnabled) await setDiscordPresence(settings, 'launcher', 'Launcher aperto')
      else { discordRpc?.close(); discordRpc = null }
      return { ok: true, enabled: settings.discordPresenceEnabled }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('client:profile', async () => {
    try {
      const settings = await loadSettings()
      return { ok: true, profile: await clientProfile(settings) }
    } catch (error) { return { ok: false, error: safeError(error), profile: null } }
  })

  ipcMain.handle('quests:list', async () => {
    try {
      const settings = await loadSettings()
      return { ok: true, ...(await clientQuests(settings)) }
    } catch (error) { return { ok: false, error: safeError(error), quests: [] } }
  })

  ipcMain.handle('quests:claim', async (_event, questId) => {
    try {
      const settings = await loadSettings()
      return { ok: true, ...(await claimQuest(settings, questId)) }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('store:list', async () => {
    try {
      const settings = await loadSettings()
      return { ok: true, ...(await clientStore(settings)) }
    } catch (error) { return { ok: false, error: safeError(error), items: [] } }
  })

  ipcMain.handle('store:purchase', async (_event, itemId) => {
    try {
      const settings = await loadSettings()
      return { ok: true, ...(await purchaseStoreItem(settings, itemId)) }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('admin:overview', async () => {
    try { return { ok: true, ...(await adminApi(await loadSettings(), '/admin/overview')) } }
    catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('admin:announcement', async (_event, body) => {
    try { return { ok: true, ...(await adminApi(await loadSettings(), '/admin/announcements', body || {})) } }
    catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('admin:coins', async (_event, body) => {
    try { return { ok: true, ...(await adminApi(await loadSettings(), '/admin/coins', body || {})) } }
    catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('admin:premium', async (_event, body) => {
    try { return { ok: true, ...(await adminApi(await loadSettings(), '/admin/premium', body || {})) } }
    catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('admin:quest', async (_event, body) => {
    try { return { ok: true, ...(await adminApi(await loadSettings(), '/admin/quests', body || {})) } }
    catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('store:open', async (_event, requestedUrl) => {
    try {
      const settings = await loadSettings()
      const target = String(requestedUrl || settings.storeUrl || DEFAULT_SETTINGS.storeUrl)
      const parsed = new URL(target)
      if (parsed.protocol !== 'https:') throw new Error('Lo store deve usare HTTPS.')
      await shell.openExternal(parsed.toString())
      return { ok: true }
    } catch (error) { return { ok: false, error: safeError(error) } }
  })

  ipcMain.handle('java:discover', async (_event, gameVersion) => {
    const settings = await loadSettings()
    const version = String(gameVersion || settings.selectedVersion || DEFAULT_SETTINGS.selectedVersion)
    let requiredMajor = isLegacyPreFabricRelease(version) ? 8 : 0
    try {
      const root = settings.minecraftRoot || defaultMinecraftRoot()
      const metadata = await loadVersionJsonById(version, root)
      requiredMajor = Number(metadata.javaVersion && metadata.javaVersion.majorVersion) || requiredMajor || 8
    } catch {}
    const javaPath = await discoverJava(requiredMajor)
    return { found: Boolean(javaPath), javaPath, requiredMajor, major: javaPath ? await detectJavaMajor(javaPath) : 0 }
  })
  ipcMain.handle('java:browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleziona javaw.exe o java.exe',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [{ name: 'Java', extensions: ['*'] }]
    })
    return result.canceled ? '' : result.filePaths[0]
  })
  ipcMain.handle('folder:browse-minecraft', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Seleziona cartella Minecraft', properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? '' : result.filePaths[0]
  })
  ipcMain.handle('folder:open', async (_event, kind) => {
    const settings = await loadSettings()
    const root = settings.minecraftRoot || defaultMinecraftRoot()
    const paths = await ensureInstanceLayout(settings)
    const targets = {
      root,
      instance: paths.root,
      mods: paths.mods,
      disabledMods: paths.disabledMods,
      logs: paths.logs,
      resourcepacks: paths.resourcepacks,
      shaderpacks: paths.shaderpacks,
      screenshots: paths.screenshots,
      saves: paths.saves,
      config: paths.config
    }
    const target = targets[kind] || root
    await fsp.mkdir(target, { recursive: true })
    const result = await shell.openPath(target)
    return { ok: !result, error: result || '', path: target }
  })
  ipcMain.handle('external:open', async (_event, url) => {
    if (!/^https:\/\/(?:[a-z0-9-]+\.)?(?:minecraft\.net|microsoft\.com|live\.com|modrinth\.com|discord\.com|discordapp\.com|stellarclient\.it)(\/|$)/i.test(String(url))) return { ok: false, error: 'URL non consentito.' }
    await shell.openExternal(url)
    return { ok: true }
  })

  ipcMain.handle('minecraft:launch', async (_event, requested = {}) => {
    if (launchInProgress) return { ok: false, error: 'Un avvio è già in corso.' }
    launchInProgress = true
    try {
      let settings = await saveSettings(requested)
      const normalized = await normalizeLoaderForVersion(settings, true)
      settings = normalized.settings
      if (normalized.changed) {
        sendToRenderer('minecraft:state', {
          status: 'starting',
          message: `Fabric non è disponibile per ${settings.selectedVersion}: avvio automatico in modalità Vanilla.`
        })
      }
      await ensureInstanceLayout(settings)
      if (!settings.account) throw new Error('Accedi con Microsoft prima di avviare Minecraft.')
      sendToRenderer('minecraft:state', { status: 'auth', message: 'Verifica account Minecraft…' })
      const identity = await getMinecraftIdentity(settings, false)

      let javaPath = settings.javaPath
      if (!(await pathExists(javaPath))) {
        sendToRenderer('minecraft:state', { status: 'java', message: 'Ricerca Java compatibile…' })
        javaPath = await discoverJava()
        if (javaPath) settings = await saveSettings({ javaPath })
      }
      if (!javaPath) throw new Error('Java non trovato. Installa Java 21 oppure seleziona javaw.exe nelle Impostazioni.')

      const root = settings.minecraftRoot || defaultMinecraftRoot()
      await fsp.mkdir(root, { recursive: true })
      await assertVanillaResourceProtection(settings)
      if (settings.loader === 'fabric') {
        const core = await ensureStellarCore(settings)
        if (core.reason === 'unsupported-version') {
          sendToRenderer('minecraft:state', { status: 'starting', message: `Stellar Core non disponibile per ${settings.selectedVersion}: avvio Fabric standard.` })
        }
        const audit = await auditInstalledMods(settings)
        if (audit.problems > 0) {
          sendToRenderer('minecraft:state', { status: 'starting', message: `Riparazione automatica di ${audit.problems} mod…` })
          const repaired = await repairInstalledMods(settings)
          if (repaired.audit.problems > 0) {
            throw new Error(`Impossibile riparare ${repaired.audit.problems} mod. Apri Mods > Controlla per i dettagli.`)
          }
        }
      }
      sendToRenderer('minecraft:state', { status: 'starting', message: `Preparazione Minecraft ${settings.selectedVersion}…` })
      activeGameProcess = await launchMinecraftProcess(identity, settings, javaPath, root)
      const runtimePath = activeGameProcess.stellarJavaPath || javaPath
      if (runtimePath !== settings.javaPath) settings = await saveSettings({ javaPath: runtimePath })
      sendToRenderer('minecraft:state', { status: 'running', message: `stellarClient ${settings.selectedVersion} avviato.`, pid: activeGameProcess.pid })
      if (settings.closeLauncherOnGameStart && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
      return { ok: true, pid: activeGameProcess.pid, javaPath: runtimePath, root, instanceRoot: instanceRootFor(settings), loader: settings.loader }
    } catch (error) {
      launchInProgress = false
      activeGameProcess = null
      const message = safeError(error)
      sendToRenderer('minecraft:state', { status: 'error', message })
      return { ok: false, error: message }
    }
  })
}

app.whenReady().then(async () => {
  await ensureDataDirs()
  registerIpc()
  createWindow()
  setDiscordPresence(await loadSettings(), 'launcher', 'Launcher aperto').catch(() => {})
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { closeDiscordCallbackServer(); discordRpc?.close() })
process.on('uncaughtException', error => { console.error(error); sendToRenderer('app:fatal-error', safeError(error)) })
process.on('unhandledRejection', error => { console.error(error); sendToRenderer('app:fatal-error', safeError(error)) })
