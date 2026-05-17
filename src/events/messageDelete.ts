import { Events, type Message, type PartialMessage } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export default {
  name: Events.MessageDelete,
  async execute(message: Message | PartialMessage) {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      const embed = makeEmbed(LogColors.delete, '🗑️ Message supprimé')
        .addFields(
          { name: 'Auteur', value: message.author ? `<@${message.author.id}> ${message.author.username}` : '*inconnu*', inline: true },
          { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
          { name: 'Contenu', value: message.content ? (message.content.length > 1024 ? message.content.slice(0, 1021) + '...' : message.content) : '*message vide ou média*' },
        );

      await sendLog(message.client, message.guild.id, 'logMsgDelete', embed);
    } catch {
      // silencieux
    }
  },
};
