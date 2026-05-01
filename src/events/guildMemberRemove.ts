import { Events, type GuildMember, type PartialGuildMember, ChannelType } from 'discord.js';
import { getGuildConfig } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member: GuildMember | PartialGuildMember) {
    try {
      const config = await getGuildConfig(member.guild.id, member.guild.name);

      if (config.leaveChannel && config.leaveMessage) {
        const channel = member.guild.channels.cache.get(config.leaveChannel);
        if (channel?.type === ChannelType.GuildText) {
          const message = config.leaveMessage
            .replace(/{user}/g, member.user.username)
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount.toString());
          await channel.send(message).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans guildMemberRemove');
    }
  },
};
