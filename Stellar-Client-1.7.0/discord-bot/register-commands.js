'use strict'

const { REST, Routes } = require('discord.js')
const commands = require('./commands')

const token = String(process.env.DISCORD_BOT_TOKEN || '')
const clientId = String(process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || '')
const guildId = String(process.env.DISCORD_GUILD_ID || '')
if (!token || !/^\d{15,22}$/.test(clientId)) throw new Error('Configura DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID.')

const rest = new REST({ version: '10' }).setToken(token)
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
rest.put(route, { body: commands }).then(() => console.log(`Registrati ${commands.length} comandi.`))
