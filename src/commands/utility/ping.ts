import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Affiche la latence du bot.'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Calcul...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong !')
      .setColor(0x5865f2)
      .addFields(
        { name: 'Latence du bot', value: `${latency}ms`, inline: true },
        { name: 'Latence API Discord', value: `${apiLatency}ms`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};

export default command;
