'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT || 8787)))
const HOST = process.env.HOST || '127.0.0.1'
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '')
const ALLOWED_ORIGIN = String(process.env.CORS_ORIGIN || '*')
const API_KEY = String(process.env.STELLAR_API_KEY || '')
const SESSION_SECRET = String(process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'))
const DISCORD_APPLICATION_ID = String(process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || '1251494893407305791')
const DISCORD_PUBLIC_KEY = String(process.env.DISCORD_PUBLIC_KEY || '320679e9439c7359477205ae68f2072c45999fd9ad0a36490a2464cc04500d84').toLowerCase()
const DISCORD_CLIENT_SECRET = String(process.env.DISCORD_CLIENT_SECRET || '')
const DISCORD_BOT_TOKEN = String(process.env.DISCORD_BOT_TOKEN || '')
const DISCORD_GUILD_ID = String(process.env.DISCORD_GUILD_ID || '1528382367100571668')
const ADMIN_ROLE_IDS = new Set(String(process.env.ADMIN_ROLE_IDS || '').split(',').map(value => value.trim()).filter(value => /^\d{15,22}$/.test(value)))
const DISCORD_REDIRECT_URI = String(process.env.DISCORD_REDIRECT_URI || `${PUBLIC_BASE_URL}/auth/discord/callback`)
const DISCORD_BOT_PERMISSIONS = String(process.env.DISCORD_BOT_PERMISSIONS || '274878221312')
const DATA_FILE = path.join(__dirname, 'data', 'community.json')
const MAX_BODY_BYTES = 256 * 1024
const PRESENCE_TTL_MS = 90 * 1000
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const DESKTOP_LINK_TTL_MS = 10 * 60 * 1000
const ADMINISTRATOR = 8n
const sessions = new Map()
const desktopLinks = new Map()

function httpError (status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeName (value) {
  const name = String(value || '').trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw httpError(400, 'Nome Minecraft non valido.')
  return name
}

function friendKey (name) { return String(name || '').toLowerCase() }
function nowIso () { return new Date().toISOString() }
function randomId (prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}` }

function defaultData () {
  return {
    announcements: [
      { id: 'welcome-130', title: 'Stellar Client 1.7.0', body: 'Nuovo sistema Discord, Admin, quest, Stellar Coins e store test.', type: 'update', createdAt: nowIso(), author: 'Stellar Team' }
    ],
    store: [
      { id: 'founder-cape', category: 'cape', name: 'Founder Cape', description: 'Mantello fondatore Stellar.', price: 1400, premiumOnly: false, enabled: true },
      { id: 'stellar-wings', category: 'wings', name: 'Stellar Wings', description: 'Ali cosmetiche originali Stellar.', price: 2200, premiumOnly: true, enabled: true },
      { id: 'nebula-badge', category: 'badge', name: 'Nebula Badge', description: 'Badge profilo Nebula.', price: 600, premiumOnly: false, enabled: true },
      { id: 'orbit-emote', category: 'emote', name: 'Orbit Emote', description: 'Emote social del client.', price: 900, premiumOnly: false, enabled: true }
    ],
    quests: [
      { id: 'daily-login', title: 'Accesso giornaliero', description: 'Apri Stellar Client e collega il profilo.', rewardCoins: 50, target: 1, event: 'login', daily: true, enabled: true },
      { id: 'play-30', title: '30 minuti di gioco', description: 'Gioca 30 minuti con Stellar Client.', rewardCoins: 120, target: 30, event: 'minutes_played', daily: true, enabled: true },
      { id: 'win-3', title: 'Tre vittorie', description: 'Vinci tre partite su un server collegato.', rewardCoins: 180, target: 3, event: 'wins', daily: true, enabled: true }
    ],
    users: {},
    friendships: {},
    discordLinks: {},
    purchases: [],
    auditLog: []
  }
}

function normalizeUserRecord (record, name) {
  const base = record && typeof record === 'object' ? record : {}
  return {
    name: String(base.name || name || '').slice(0, 16),
    coins: Math.max(0, Math.floor(Number(base.coins || 0))),
    premiumUntil: String(base.premiumUntil || ''),
    inventory: Array.isArray(base.inventory) ? base.inventory.map(String).slice(0, 500) : [],
    questProgress: base.questProgress && typeof base.questProgress === 'object' ? base.questProgress : {},
    questClaims: base.questClaims && typeof base.questClaims === 'object' ? base.questClaims : {},
    status: String(base.status || 'offline'),
    server: String(base.server || '').slice(0, 255),
    updatedAt: Number(base.updatedAt || 0)
  }
}

function loadData () {
  const defaults = defaultData()
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const users = {}
    for (const [key, value] of Object.entries(parsed.users || {})) users[key] = normalizeUserRecord(value, value && value.name)
    return {
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : defaults.announcements,
      store: Array.isArray(parsed.store) ? parsed.store : defaults.store,
      quests: Array.isArray(parsed.quests) ? parsed.quests : defaults.quests,
      users,
      friendships: parsed.friendships && typeof parsed.friendships === 'object' ? parsed.friendships : {},
      discordLinks: parsed.discordLinks && typeof parsed.discordLinks === 'object' ? parsed.discordLinks : {},
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : []
    }
  } catch {
    return defaults
  }
}

function saveData (data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  const temp = `${DATA_FILE}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(temp, DATA_FILE)
}

function securityHeaders (extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; script-src 'none'; base-uri 'none'; form-action 'none'",
    ...extra
  }
}

function json (response, status, payload, extra = {}) {
  const body = JSON.stringify(payload)
  response.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization, x-stellar-key, x-signature-ed25519, x-signature-timestamp',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    ...extra
  }))
  response.end(body)
}

function html (response, status, body, extra = {}) {
  response.writeHead(status, securityHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...extra }))
  response.end(body)
}

function redirect (response, location, extra = {}) {
  response.writeHead(302, securityHeaders({ Location: location, ...extra }))
  response.end()
}

function authorizedApiKey (request) {
  if (!API_KEY) return false
  const provided = Buffer.from(String(request.headers['x-stellar-key'] || ''))
  const expected = Buffer.from(API_KEY)
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected)
}

function authorizedUserOrApi (request, minecraftName) {
  if (authorizedApiKey(request)) return true
  const session = bearerSession(request)
  return Boolean(session && friendKey(session.minecraftName) === friendKey(minecraftName))
}

async function readRawBody (request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw httpError(413, 'Richiesta troppo grande.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readBody (request) {
  const raw = await readRawBody(request)
  if (!raw.length) return {}
  try { return JSON.parse(raw.toString('utf8')) } catch { throw httpError(400, 'JSON non valido.') }
}

function base64url (value) { return Buffer.from(value).toString('base64url') }

function signState (payload) {
  const encoded = base64url(JSON.stringify(payload))
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyState (value) {
  const [encoded, signature] = String(value || '').split('.')
  if (!encoded || !signature) throw httpError(400, 'State OAuth non valido.')
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw httpError(400, 'State OAuth non valido.')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  if (!payload.exp || payload.exp < Date.now()) throw httpError(400, 'State OAuth scaduto.')
  return payload
}

function createSession (details) {
  const token = crypto.randomBytes(32).toString('base64url')
  sessions.set(token, { ...details, expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}

function bearerSession (request) {
  const header = String(request.headers.authorization || '')
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,})$/i.exec(header)
  if (!match) return null
  const session = sessions.get(match[1])
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(match[1])
    return null
  }
  return session
}

function requireSession (request) {
  const session = bearerSession(request)
  if (!session) throw httpError(401, 'Sessione Stellar non valida o scaduta.')
  return session
}

function requireAdmin (request) {
  const session = requireSession(request)
  if (!session.isAdmin) throw httpError(403, 'Accesso riservato agli amministratori Discord del server configurato.')
  return session
}

async function discordRequest (endpoint, token, label) {
  const response = await fetch(`https://discord.com/api/v10${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw httpError(502, `${label}: ${payload.message || response.status}`)
  return payload
}

async function exchangeDiscordCode (code) {
  const body = new URLSearchParams({
    client_id: DISCORD_APPLICATION_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_REDIRECT_URI
  })
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) throw httpError(502, payload.error_description || 'Scambio token Discord non riuscito.')
  return payload
}

async function discordIdentity (accessToken) {
  const raw = await discordRequest('/users/@me', accessToken, 'Profilo Discord')
  return { id: String(raw.id || ''), username: String(raw.username || ''), globalName: String(raw.global_name || ''), avatar: raw.avatar ? String(raw.avatar) : '' }
}

async function discordAccess (accessToken) {
  if (!/^\d{15,22}$/.test(DISCORD_GUILD_ID)) return { guildMember: false, isAdmin: false, roles: [], permissions: '0' }
  const guilds = await discordRequest('/users/@me/guilds?limit=200', accessToken, 'Server Discord')
  const guild = Array.isArray(guilds) ? guilds.find(item => String(item.id) === DISCORD_GUILD_ID) : null
  if (!guild) return { guildMember: false, isAdmin: false, roles: [], permissions: '0' }
  let roles = []
  try {
    const member = await discordRequest(`/users/@me/guilds/${DISCORD_GUILD_ID}/member`, accessToken, 'Ruoli Discord')
    roles = Array.isArray(member.roles) ? member.roles.map(String) : []
  } catch {}
  let permissions = 0n
  try { permissions = BigInt(String(guild.permissions || '0')) } catch {}
  const roleAdmin = roles.some(role => ADMIN_ROLE_IDS.has(role))
  return {
    guildMember: true,
    isAdmin: Boolean(guild.owner) || (permissions & ADMINISTRATOR) === ADMINISTRATOR || roleAdmin,
    roles,
    permissions: permissions.toString()
  }
}

function requireDiscordConfig () {
  if (!/^\d{15,22}$/.test(DISCORD_APPLICATION_ID) || !DISCORD_CLIENT_SECRET || !/^https?:\/\//.test(DISCORD_REDIRECT_URI)) {
    throw httpError(503, 'OAuth Discord non configurato sul backend.')
  }
}

function getUser (data, minecraftName) {
  const name = normalizeName(minecraftName)
  const key = friendKey(name)
  if (!data.users[key]) data.users[key] = normalizeUserRecord({ name }, name)
  return data.users[key]
}

function isPremium (user) {
  const timestamp = Date.parse(user.premiumUntil || '')
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

function questView (data, user) {
  const day = new Date().toISOString().slice(0, 10)
  return data.quests.filter(quest => quest.enabled !== false).map(quest => {
    const progress = Math.max(0, Math.floor(Number(user.questProgress[quest.id] || 0)))
    const claimed = quest.daily ? user.questClaims[quest.id] === day : Boolean(user.questClaims[quest.id])
    return { ...quest, progress: Math.min(progress, Number(quest.target || 1)), complete: progress >= Number(quest.target || 1), claimed }
  })
}

function clientProfile (data, session) {
  const user = getUser(data, session.minecraftName)
  return {
    minecraftName: user.name,
    discord: session.discord,
    guildMember: session.guildMember,
    isAdmin: session.isAdmin,
    coins: user.coins,
    premium: isPremium(user),
    premiumUntil: user.premiumUntil || null,
    inventory: user.inventory,
    quests: questView(data, user)
  }
}

function audit (data, session, action, target, details = {}) {
  data.auditLog.unshift({ id: randomId('audit'), action, target: String(target || ''), actorDiscordId: session.discord.id, actorName: session.discord.globalName || session.discord.username, details, createdAt: nowIso() })
  data.auditLog = data.auditLog.slice(0, 1000)
}

function publicPresence (record) {
  const fresh = record && Date.now() - Number(record.updatedAt || 0) <= PRESENCE_TTL_MS
  return { status: fresh ? String(record.status || 'online') : 'offline', server: fresh ? String(record.server || '') : '', updatedAt: Number(record && record.updatedAt) || 0 }
}

function listFriends (data, user) {
  const key = friendKey(user)
  const names = Array.isArray(data.friendships[key]) ? data.friendships[key] : []
  return names.map(name => ({ id: friendKey(name), name, discord: data.discordLinks[friendKey(name)] || null, ...publicPresence(data.users[friendKey(name)]) }))
}

function verifyDiscordSignature (raw, signatureHex, timestamp) {
  if (!/^[0-9a-f]{64}$/i.test(DISCORD_PUBLIC_KEY) || !/^[0-9a-f]{128}$/i.test(String(signatureHex || '')) || !timestamp) return false
  try {
    const publicKeyDer = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(DISCORD_PUBLIC_KEY, 'hex')])
    const publicKey = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' })
    return crypto.verify(null, Buffer.concat([Buffer.from(String(timestamp)), raw]), publicKey, Buffer.from(String(signatureHex), 'hex'))
  } catch { return false }
}

async function handleInteractions (request, response) {
  const raw = await readRawBody(request)
  if (!verifyDiscordSignature(raw, request.headers['x-signature-ed25519'], request.headers['x-signature-timestamp'])) {
    return json(response, 401, { error: 'invalid request signature' })
  }
  let interaction
  try { interaction = JSON.parse(raw.toString('utf8')) } catch { throw httpError(400, 'JSON non valido.') }
  if (interaction.type === 1) return json(response, 200, { type: 1 })
  return json(response, 200, { type: 4, data: { flags: 64, content: 'Stellar Client è online. Usa i comandi slash registrati dal bot.' } })
}

async function handle (request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {})
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  if (request.method === 'POST' && url.pathname === '/interactions') return handleInteractions(request, response)

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, {
      ok: true,
      service: 'stellar-social',
      version: '1.7.0',
      discordApplicationId: DISCORD_APPLICATION_ID,
      discordGuildId: DISCORD_GUILD_ID,
      discordOAuth: Boolean(DISCORD_APPLICATION_ID && DISCORD_CLIENT_SECRET),
      publicKeyConfigured: /^[0-9a-f]{64}$/i.test(DISCORD_PUBLIC_KEY),
      botConfigured: Boolean(DISCORD_BOT_TOKEN),
      adminRoleCount: ADMIN_ROLE_IDS.size
    })
  }

  if (request.method === 'POST' && url.pathname === '/auth/discord/desktop/start') {
    requireDiscordConfig()
    const body = await readBody(request)
    const minecraftName = normalizeName(body.minecraftName)
    const pairingId = crypto.randomBytes(32).toString('base64url')
    desktopLinks.set(pairingId, { minecraftName, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + DESKTOP_LINK_TTL_MS, user: null, desktopToken: null })
    return json(response, 200, { ok: true, pairingId, expiresIn: Math.floor(DESKTOP_LINK_TTL_MS / 1000), authorizeUrl: `${PUBLIC_BASE_URL}/auth/discord/desktop/authorize?pairing_id=${encodeURIComponent(pairingId)}` })
  }

  if (request.method === 'GET' && url.pathname === '/auth/discord/desktop/authorize') {
    requireDiscordConfig()
    const pairingId = String(url.searchParams.get('pairing_id') || '')
    const pending = desktopLinks.get(pairingId)
    if (!pending || pending.expiresAt < Date.now()) throw httpError(404, 'Collegamento Discord scaduto.')
    const state = signState({ mode: 'desktop', pairingId, nonce: crypto.randomBytes(16).toString('hex'), exp: Date.now() + 10 * 60 * 1000 })
    const authorize = new URL('https://discord.com/oauth2/authorize')
    authorize.search = new URLSearchParams({ client_id: DISCORD_APPLICATION_ID, response_type: 'code', redirect_uri: DISCORD_REDIRECT_URI, scope: 'identify guilds guilds.members.read', state, prompt: 'consent' }).toString()
    return redirect(response, authorize.toString())
  }

  if (request.method === 'GET' && url.pathname === '/auth/discord/desktop/status') {
    const pairingId = String(url.searchParams.get('pairing_id') || '')
    const pending = desktopLinks.get(pairingId)
    if (!pending || pending.expiresAt < Date.now()) {
      desktopLinks.delete(pairingId)
      return json(response, 404, { ok: false, status: 'expired', error: 'Collegamento Discord scaduto.' })
    }
    if (pending.status !== 'complete') return json(response, 200, { ok: true, status: 'pending' })
    desktopLinks.delete(pairingId)
    return json(response, 200, { ok: true, status: 'complete', user: pending.user, desktopToken: pending.desktopToken })
  }

  if (request.method === 'GET' && url.pathname === '/auth/discord/callback') {
    requireDiscordConfig()
    const state = verifyState(url.searchParams.get('state'))
    const oauthError = url.searchParams.get('error')
    if (oauthError) throw httpError(400, `Discord: ${oauthError}`)
    const code = String(url.searchParams.get('code') || '')
    if (!code) throw httpError(400, 'Codice Discord mancante.')
    const token = await exchangeDiscordCode(code)
    const discord = await discordIdentity(token.access_token)
    const access = await discordAccess(token.access_token)
    if (state.mode !== 'desktop') throw httpError(400, 'Modalità callback non valida.')
    const pending = desktopLinks.get(state.pairingId)
    if (!pending || pending.expiresAt < Date.now()) throw httpError(400, 'Collegamento desktop scaduto.')
    const data = loadData()
    const link = { ...discord, linkedAt: nowIso(), guildMember: access.guildMember, isAdmin: access.isAdmin }
    data.discordLinks[friendKey(pending.minecraftName)] = link
    getUser(data, pending.minecraftName)
    saveData(data)
    const desktopToken = createSession({ minecraftName: pending.minecraftName, discord, guildMember: access.guildMember, isAdmin: access.isAdmin, roles: access.roles, permissions: access.permissions })
    pending.status = 'complete'
    pending.user = link
    pending.desktopToken = desktopToken
    desktopLinks.set(state.pairingId, pending)
    return html(response, 200, `<!doctype html><meta charset="utf-8"><title>Stellar Client</title><style>body{margin:0;display:grid;place-items:center;height:100vh;background:#030304;color:#f7f5ff;font:16px system-ui}.card{width:min(440px,80vw);padding:38px;border:1px solid #583a91;border-radius:26px;background:#100d16;text-align:center;box-shadow:0 24px 90px #000}.mark{font-size:46px;margin-bottom:8px}.ok{color:#a878ff}.admin{margin-top:12px;color:#e0c8ff;font-size:13px}</style><div class="card"><div class="mark">✦</div><h2>Discord collegato</h2><p>Puoi tornare a Stellar Client.</p><div class="admin">${access.isAdmin ? 'Accesso Admin verificato sul server Discord.' : access.guildMember ? 'Membro del server verificato.' : 'Account non presente nel server configurato.'}</div></div>`)
  }

  if (request.method === 'GET' && url.pathname === '/bot/invite') {
    if (!/^\d{15,22}$/.test(DISCORD_APPLICATION_ID)) throw httpError(503, 'Discord Application ID non configurato.')
    const invite = new URL('https://discord.com/oauth2/authorize')
    invite.search = new URLSearchParams({ client_id: DISCORD_APPLICATION_ID, scope: 'bot applications.commands', permissions: DISCORD_BOT_PERMISSIONS, guild_id: DISCORD_GUILD_ID, disable_guild_select: 'false' }).toString()
    return redirect(response, invite.toString())
  }

  const data = loadData()

  if (request.method === 'GET' && url.pathname === '/client/me') return json(response, 200, { ok: true, profile: clientProfile(data, requireSession(request)) })
  if (request.method === 'GET' && url.pathname === '/client/store') return json(response, 200, { ok: true, items: data.store.filter(item => item.enabled !== false), profile: clientProfile(data, requireSession(request)) })
  if (request.method === 'GET' && url.pathname === '/client/quests') return json(response, 200, { ok: true, quests: clientProfile(data, requireSession(request)).quests })

  if (request.method === 'POST' && url.pathname === '/client/quest-event') {
    const session = requireSession(request)
    const body = await readBody(request)
    const event = String(body.event || '').slice(0, 64)
    const amount = Math.max(1, Math.min(10000, Math.floor(Number(body.amount || 1))))
    const user = getUser(data, session.minecraftName)
    for (const quest of data.quests) if (quest.enabled !== false && quest.event === event) user.questProgress[quest.id] = Math.min(Number(quest.target || 1), Number(user.questProgress[quest.id] || 0) + amount)
    saveData(data)
    return json(response, 200, { ok: true, quests: questView(data, user) })
  }

  if (request.method === 'POST' && url.pathname === '/client/quests/claim') {
    const session = requireSession(request)
    const body = await readBody(request)
    const quest = data.quests.find(item => item.id === String(body.questId || '') && item.enabled !== false)
    if (!quest) throw httpError(404, 'Quest non trovata.')
    const user = getUser(data, session.minecraftName)
    const view = questView(data, user).find(item => item.id === quest.id)
    if (!view.complete) throw httpError(409, 'Quest non completata.')
    if (view.claimed) throw httpError(409, 'Ricompensa già riscattata.')
    user.coins += Math.max(0, Math.floor(Number(quest.rewardCoins || 0)))
    user.questClaims[quest.id] = quest.daily ? new Date().toISOString().slice(0, 10) : nowIso()
    saveData(data)
    return json(response, 200, { ok: true, profile: clientProfile(data, session) })
  }

  if (request.method === 'POST' && url.pathname === '/client/store/purchase') {
    const session = requireSession(request)
    const body = await readBody(request)
    const item = data.store.find(entry => entry.id === String(body.itemId || '') && entry.enabled !== false)
    if (!item) throw httpError(404, 'Articolo non trovato.')
    const user = getUser(data, session.minecraftName)
    if (user.inventory.includes(item.id)) throw httpError(409, 'Articolo già posseduto.')
    if (item.premiumOnly && !isPremium(user)) throw httpError(403, 'Questo articolo richiede Stellar Premium.')
    const price = Math.max(0, Math.floor(Number(item.price || 0)))
    if (user.coins < price) throw httpError(409, 'Stellar Coins insufficienti.')
    user.coins -= price
    user.inventory.push(item.id)
    data.purchases.unshift({ id: randomId('purchase'), minecraftName: user.name, discordId: session.discord.id, itemId: item.id, price, createdAt: nowIso() })
    data.purchases = data.purchases.slice(0, 5000)
    saveData(data)
    return json(response, 200, { ok: true, profile: clientProfile(data, session), item })
  }

  if (request.method === 'GET' && url.pathname === '/admin/overview') {
    requireAdmin(request)
    return json(response, 200, { ok: true, counts: { users: Object.keys(data.users).length, announcements: data.announcements.length, quests: data.quests.length, purchases: data.purchases.length }, recentAudit: data.auditLog.slice(0, 25), recentPurchases: data.purchases.slice(0, 20) })
  }

  if (request.method === 'POST' && url.pathname === '/admin/announcements') {
    const session = requireAdmin(request)
    const body = await readBody(request)
    const title = String(body.title || '').trim().slice(0, 100)
    const content = String(body.body || '').trim().slice(0, 2000)
    if (title.length < 3 || content.length < 3) throw httpError(400, 'Titolo e testo obbligatori.')
    const item = { id: randomId('news'), title, body: content, type: ['update', 'event', 'maintenance'].includes(body.type) ? body.type : 'update', createdAt: nowIso(), author: session.discord.globalName || session.discord.username }
    data.announcements.unshift(item)
    data.announcements = data.announcements.slice(0, 100)
    audit(data, session, 'announcement.create', item.id, { title })
    saveData(data)
    return json(response, 201, { ok: true, item })
  }

  if (request.method === 'POST' && url.pathname === '/admin/coins') {
    const session = requireAdmin(request)
    const body = await readBody(request)
    const target = normalizeName(body.minecraftName)
    const amount = Math.max(-1000000, Math.min(1000000, Math.floor(Number(body.amount || 0))))
    if (!amount) throw httpError(400, 'Importo non valido.')
    const user = getUser(data, target)
    user.coins = Math.max(0, user.coins + amount)
    audit(data, session, 'coins.adjust', target, { amount, reason: String(body.reason || '').slice(0, 180) })
    saveData(data)
    return json(response, 200, { ok: true, minecraftName: target, coins: user.coins })
  }

  if (request.method === 'POST' && url.pathname === '/admin/premium') {
    const session = requireAdmin(request)
    const body = await readBody(request)
    const target = normalizeName(body.minecraftName)
    const days = Math.max(0, Math.min(3650, Math.floor(Number(body.days || 0))))
    const user = getUser(data, target)
    user.premiumUntil = days === 0 ? '' : new Date(Math.max(Date.now(), Date.parse(user.premiumUntil || '') || 0) + days * 86400000).toISOString()
    audit(data, session, days === 0 ? 'premium.revoke' : 'premium.grant', target, { days })
    saveData(data)
    return json(response, 200, { ok: true, minecraftName: target, premiumUntil: user.premiumUntil || null })
  }

  if (request.method === 'POST' && url.pathname === '/admin/quests') {
    const session = requireAdmin(request)
    const body = await readBody(request)
    const title = String(body.title || '').trim().slice(0, 100)
    if (title.length < 3) throw httpError(400, 'Titolo quest obbligatorio.')
    const quest = { id: randomId('quest'), title, description: String(body.description || '').trim().slice(0, 500), rewardCoins: Math.max(0, Math.min(100000, Math.floor(Number(body.rewardCoins || 0)))), target: Math.max(1, Math.min(100000, Math.floor(Number(body.target || 1)))), event: String(body.event || 'custom').trim().slice(0, 64), daily: body.daily !== false, enabled: true }
    data.quests.unshift(quest)
    audit(data, session, 'quest.create', quest.id, { title: quest.title })
    saveData(data)
    return json(response, 201, { ok: true, quest })
  }

  if (request.method === 'GET' && url.pathname === '/announcements') return json(response, 200, { items: data.announcements.slice(0, 50) })
  if (request.method === 'GET' && url.pathname === '/store') return json(response, 200, { items: data.store.filter(item => item.enabled !== false), checkoutEnabled: true, currency: 'Stellar Coins' })

  if (request.method === 'GET' && url.pathname === '/friends') {
    const user = normalizeName(url.searchParams.get('user'))
    return json(response, 200, { friends: listFriends(data, user) })
  }

  if (request.method === 'POST' && url.pathname === '/friends') {
    const body = await readBody(request)
    const user = normalizeName(body.user)
    if (!authorizedUserOrApi(request, user)) throw httpError(401, 'Sessione o chiave API non valida.')
    const friend = normalizeName(body.friend)
    if (friendKey(user) === friendKey(friend)) throw httpError(400, 'Non puoi aggiungere te stesso.')
    const key = friendKey(user)
    const existing = Array.isArray(data.friendships[key]) ? data.friendships[key] : []
    if (!existing.some(item => friendKey(item) === friendKey(friend))) existing.push(friend)
    data.friendships[key] = existing.slice(0, 250)
    saveData(data)
    return json(response, 200, { friends: listFriends(data, user) })
  }

  if (request.method === 'DELETE' && url.pathname === '/friends') {
    const user = normalizeName(url.searchParams.get('user'))
    if (!authorizedUserOrApi(request, user)) throw httpError(401, 'Sessione o chiave API non valida.')
    const friend = normalizeName(url.searchParams.get('friend'))
    const key = friendKey(user)
    data.friendships[key] = (Array.isArray(data.friendships[key]) ? data.friendships[key] : []).filter(item => friendKey(item) !== friendKey(friend))
    saveData(data)
    return json(response, 200, { friends: listFriends(data, user) })
  }

  if (request.method === 'POST' && url.pathname === '/presence') {
    const body = await readBody(request)
    const name = normalizeName(body.user)
    if (!authorizedUserOrApi(request, name)) throw httpError(401, 'Sessione o chiave API non valida.')
    const user = getUser(data, name)
    user.status = ['online', 'idle', 'playing', 'offline'].includes(body.status) ? body.status : 'online'
    user.server = String(body.server || '').slice(0, 255)
    user.updatedAt = Date.now()
    saveData(data)
    return json(response, 200, { ok: true })
  }

  if (request.method === 'GET' && url.pathname === '/bot/profile') {
    if (!authorizedApiKey(request)) throw httpError(401, 'Chiave API non valida.')
    const minecraftName = normalizeName(url.searchParams.get('minecraft'))
    const user = getUser(data, minecraftName)
    return json(response, 200, { ok: true, minecraftName: user.name, coins: user.coins, premium: isPremium(user), premiumUntil: user.premiumUntil || null, quests: questView(data, user) })
  }

  if (request.method === 'POST' && url.pathname === '/bot/admin/coins') {
    if (!authorizedApiKey(request)) throw httpError(401, 'Chiave API non valida.')
    const body = await readBody(request)
    const user = getUser(data, normalizeName(body.minecraftName))
    const amount = Math.max(-1000000, Math.min(1000000, Math.floor(Number(body.amount || 0))))
    user.coins = Math.max(0, user.coins + amount)
    saveData(data)
    return json(response, 200, { ok: true, minecraftName: user.name, coins: user.coins })
  }

  throw httpError(404, 'Endpoint non trovato.')
}

setInterval(() => {
  const now = Date.now()
  for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id)
  for (const [id, link] of desktopLinks) if (link.expiresAt < now) desktopLinks.delete(id)
}, 60 * 60 * 1000).unref()

const server = http.createServer((request, response) => {
  handle(request, response).catch(error => {
    const status = Number(error.status) || 500
    json(response, status, { ok: false, error: status === 500 ? 'Errore interno.' : error.message })
    if (status === 500) console.error(error)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Stellar Social 1.7.0 disponibile su http://${HOST}:${PORT}`)
  if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET non impostato: le sessioni cambieranno a ogni riavvio.')
  if (!DISCORD_CLIENT_SECRET) console.warn('DISCORD_CLIENT_SECRET non impostato: il login Discord resta disabilitato.')
  if (!API_KEY) console.warn('STELLAR_API_KEY non impostata: gli endpoint bot/social protetti restano bloccati.')
})
