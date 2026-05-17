import { Events, type GuildChannel, type NonThreadGuildBasedChannel } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export const channelCreate = {
  name: Events.ChannelCreate,
  async execute(channel: GuildChannel) {
    try {
      if (!channel.guild) return;
      const embed = makeEmbed(LogColors.create, '📁 Salon créé', `**${channel.name}**`)
        .addFields(
          { name: 'Type', value: String(channel.type), inline: true },
          { name: 'ID',   value: channel.id,           inline: true },
        );
      await sendLog(channel.client, channel.guild.id, 'logSalons', embed);
    } catch {}
  },
};

export const channelDelete = {
  name: Events.ChannelDelete,
  async execute(channel: GuildChannel) {
    try {
      if (!channel.guild) return;
      const embed = makeEmbed(LogColors.remove, '🗑️ Salon supprimé', `**${channel.name}**`)
        .addFields(
          { name: 'Type', value: String(channel.type), inline: true },
          { name: 'ID',   value: channel.id,           inline: true },
        );
      await sendLog(channel.client, channel.guild.id, 'logSalons', embed);
    } catch {}
  },
};

export const channelUpdate = {
  name: Events.ChannelUpdate,
  async execute(oldChannel: NonThreadGuildBasedChannel, newChannel: NonThreadGuildBasedChannel) {
    try {
      if (!newChannel.guild) return;
      if (oldChannel.name === newChannel.name) return;
      const embed = makeEmbed(LogColors.update, '✏️ Salon renommé')
        .addFields(
          { name: 'Avant', value: oldChannel.name, inline: true },
          { name: 'Après', value: newChannel.name, inline: true },
          { name: 'ID',    value: newChannel.id,   inline: true },
        );
      await sendLog(newChannel.client, newChannel.guild.id, 'logSalons', embed);
    } catch {}
  },
};
