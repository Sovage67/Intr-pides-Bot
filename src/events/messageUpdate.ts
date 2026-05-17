import { Events, type Message, type PartialMessage } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export default {
  name: Events.MessageUpdate,
  async execute(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    try {
      if (!newMessage.guild) return;
      if (newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;

      const embed = makeEmbed(LogColors.edit, '✏️ Message modifié')
        .addFields(
          { name: 'Auteur', value: newMessage.author ? `<@${newMessage.author.id}> ${newMessage.author.username}` : '*inconnu*', inline: true },
          { name: 'Salon', value: `<#${newMessage.channelId}>`, inline: true },
          { name: 'Avant', value: oldMessage.content ? (oldMessage.content.length > 1024 ? oldMessage.content.slice(0, 1021) + '...' : oldMessage.content) : '*inconnu*' },
          { name: 'Après', value: newMessage.content ? (newMessage.content.length > 1024 ? newMessage.content.slice(0, 1021) + '...' : newMessage.content) : '*vide*' },
        )
        .setURL(newMessage.url);

      await sendLog(newMessage.client, newMessage.guild.id, 'logMsgEdit', embed);
    } catch {
      // silencieux
    }
  },
};
