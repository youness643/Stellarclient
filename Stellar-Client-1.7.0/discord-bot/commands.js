'use strict'

const { SlashCommandBuilder } = require('discord.js')

module.exports = [
  new SlashCommandBuilder().setName('stellar').setDescription('Mostra i collegamenti ufficiali di Stellar Client.'),
  new SlashCommandBuilder().setName('status').setDescription('Controlla lo stato dei servizi Stellar.'),
  new SlashCommandBuilder().setName('store').setDescription('Apre lo store Stellar Client.'),
  new SlashCommandBuilder().setName('download').setDescription('Mostra la pagina di download del client.'),
  new SlashCommandBuilder().setName('balance').setDescription('Mostra gli Stellar Coins di un giocatore.')
    .addStringOption(option => option.setName('player').setDescription('Nome Minecraft').setRequired(true).setMinLength(3).setMaxLength(16)),
  new SlashCommandBuilder().setName('quests').setDescription('Mostra le quest di un giocatore.')
    .addStringOption(option => option.setName('player').setDescription('Nome Minecraft').setRequired(true).setMinLength(3).setMaxLength(16)),
  new SlashCommandBuilder().setName('premium').setDescription('Mostra lo stato Stellar Premium.')
    .addStringOption(option => option.setName('player').setDescription('Nome Minecraft').setRequired(true).setMinLength(3).setMaxLength(16)),
  new SlashCommandBuilder().setName('coins').setDescription('Gestione amministrativa degli Stellar Coins.')
    .addSubcommand(sub => sub.setName('grant').setDescription('Aggiunge o rimuove Stellar Coins.')
      .addStringOption(option => option.setName('player').setDescription('Nome Minecraft').setRequired(true).setMinLength(3).setMaxLength(16))
      .addIntegerOption(option => option.setName('amount').setDescription('Importo positivo o negativo').setRequired(true).setMinValue(-1000000).setMaxValue(1000000)))
].map(command => command.toJSON())
