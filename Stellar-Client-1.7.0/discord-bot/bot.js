'use strict'

const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, PermissionFlagsBits } = require('discord.js')

const token = String(process.env.DISCORD_BOT_TOKEN || '')
const backend = String(process.env.STELLAR_BACKEND_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const apiKey = String(process.env.STELLAR_API_KEY || '')
const site = String(process.env.STELLAR_SITE_URL || 'https://stellarclient.it').replace(/\/$/, '')
const guildId = String(process.env.DISCORD_GUILD_ID || '1528382367100571668')
if (!token) throw new Error('Configura DISCORD_BOT_TOKEN nelle variabili d’ambiente.')
if (!apiKey) throw new Error('Configura STELLAR_API_KEY nelle variabili d’ambiente.')

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

function embed (title, description) {
  return new EmbedBuilder().setColor(0x8B5CF6).setTitle(title).setDescription(description).setFooter({ text: 'Stellar Client' }).setTimestamp()
}

async function api (pathname, options = {}) {
  const response = await fetch(`${backend}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-stellar-key': apiKey, ...(options.headers || {}) },
    signal: AbortSignal.timeout(8000)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
  return payload
}

function isAdministrator (interaction) {
  return interaction.guildId === guildId && Boolean(interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
}

client.once('ready', () => {
  client.user.setPresence({ activities: [{ name: 'Stellar Client', type: ActivityType.Playing }], status: 'online' })
  console.log(`Bot collegato come ${client.user.tag}`)
})

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return
  try {
    if (interaction.commandName === 'stellar') return interaction.reply({ embeds: [embed('Stellar Client', `[Sito](${site}) • [Store](${site}/store) • [Download](${site}/download)`)] })
    if (interaction.commandName === 'store') return interaction.reply({ embeds: [embed('Stellar Store', `[Apri lo store ufficiale](${site}/store)`)] })
    if (interaction.commandName === 'download') return interaction.reply({ embeds: [embed('Download', `[Scarica Stellar Client](${site}/download)`)] })
    if (interaction.commandName === 'status') {
      await interaction.deferReply()
      const health = await api('/health')
      return interaction.editReply({ embeds: [embed('Stato servizi', `Backend online • versione ${health.version}\nOAuth Discord: ${health.discordOAuth ? 'configurato' : 'non configurato'}\nBot: ${health.botConfigured ? 'configurato' : 'non configurato'}`)] })
    }
    if (['balance', 'quests', 'premium'].includes(interaction.commandName)) {
      const player = interaction.options.getString('player', true)
      const profile = await api(`/bot/profile?minecraft=${encodeURIComponent(player)}`)
      if (interaction.commandName === 'balance') return interaction.reply({ embeds: [embed(`${profile.minecraftName} • Stellar Coins`, `Saldo: **${profile.coins.toLocaleString('it-IT')}** Stellar Coins`)] })
      if (interaction.commandName === 'premium') return interaction.reply({ embeds: [embed(`${profile.minecraftName} • Premium`, profile.premium ? `Premium attivo fino al **${new Date(profile.premiumUntil).toLocaleString('it-IT')}**` : 'Premium non attivo.')] })
      const lines = profile.quests.slice(0, 8).map(quest => `${quest.claimed ? '✓' : quest.complete ? '◆' : '◇'} **${quest.title}** — ${quest.progress}/${quest.target} • ${quest.rewardCoins} coins`)
      return interaction.reply({ embeds: [embed(`${profile.minecraftName} • Quest`, lines.join('\n') || 'Nessuna quest disponibile.')] })
    }
    if (interaction.commandName === 'coins') {
      if (!isAdministrator(interaction)) return interaction.reply({ content: 'Comando riservato agli amministratori del server Discord.', ephemeral: true })
      const player = interaction.options.getString('player', true)
      const amount = interaction.options.getInteger('amount', true)
      const result = await api('/bot/admin/coins', { method: 'POST', body: JSON.stringify({ minecraftName: player, amount }) })
      return interaction.reply({ embeds: [embed('Stellar Coins aggiornati', `${result.minecraftName}: **${result.coins.toLocaleString('it-IT')}** coins`)], ephemeral: true })
    }
  } catch (error) {
    const message = `Operazione non riuscita: ${String(error.message || error).slice(0, 300)}`
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {})
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {})
    console.error(error)
  }
})

client.login(token)
