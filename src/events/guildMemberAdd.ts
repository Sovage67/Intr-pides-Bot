import { Events, type GuildMember, ChannelType } from 'discord.js';
import { getGuildConfig } from '../lib/cache.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    try {
      // Journal : enregistrer l'arrivée
      await prisma.memberLog.create({
        data: {
          guildId: member.guild.id,
          userId: member.id,
          username: member.user.username,
          type: 'join',
        },
      }).catch(() => {});

      const config = await getGuildConfig(member.guild.id, member.guild.name);

      // Auto-rôle
      if (config.autoRole) {
        await member.roles.add(config.autoRole).catch((err) => {
          logger.warn({ err }, `Impossible d'attribuer l'auto-rôle dans ${member.guild.name}`);
        });
      }

      // Message de bienvenue
      if (config.welcomeChannel && config.welcomeMessage) {
        const channel = member.guild.channels.cache.get(config.welcomeChannel);
        if (channel?.type === ChannelType.GuildText) {
          const message = config.welcomeMessage
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount.toString());
          await channel.send(message).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans guildMemberAdd');
    }
  },
};
