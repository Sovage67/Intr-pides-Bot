import { Events, type GuildMember, type PartialGuildMember, ChannelType } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';
import { getGuildConfig } from '../lib/cache.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getArriveesConfig, sendWelcomeGoodbye } from './guildMemberAdd.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member: GuildMember | PartialGuildMember) {
    try {
      // ── Enregistrement MemberLog (stats) ──
      if (member.user) {
        prisma.memberLog.create({
          data: {
            guildId: member.guild.id,
            userId: member.id,
            username: member.user.username,
            type: 'leave',
          },
        }).catch(() => {});
      }

      // ── Résoudre le member partiel si nécessaire ──
      const fullMember = member.partial
        ? await member.fetch().catch(() => null)
        : member as GuildMember;
      if (!fullMember) return;

      // ── Message d'au revoir (nouveau système Arrivées & Départs) ──
      const cfg = await getArriveesConfig(member.guild.id);
      if (cfg) {
        await sendWelcomeGoodbye(fullMember, cfg, 'goodbye');
      } else {
        // Fallback ancienne config Guild (rétro-compatibilité)
        const config = await getGuildConfig(member.guild.id, member.guild.name);
        if (config.leaveChannel && config.leaveMessage && member.user) {
          const channel = member.guild.channels.cache.get(config.leaveChannel);
          if (channel?.type === ChannelType.GuildText) {
            const message = config.leaveMessage
              .replace(/{user}/g, member.user.username)
              .replace(/{username}/g, member.user.username)
              .replace(/{server}/g, member.guild.name)
              .replace(/{count}/g, member.guild.memberCount.toString());
            await (channel as any).send(message).catch(() => {});
          }
        }
      }
      // ── Log départ ────────────────────────────────────────────────────────
      if (member.user) {
        const roles = member.roles?.cache
          ? [...member.roles.cache.values()].filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'Aucun'
          : 'Aucun';
        const embedLog = makeEmbed(LogColors.leave, '📤 Membre parti',
          `<@${member.id}> **${member.user.username}**`)
          .addFields(
            { name: 'ID', value: member.id, inline: true },
            { name: 'Membres restants', value: `${member.guild.memberCount}`, inline: true },
            { name: 'Rôles', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles },
          )
          .setThumbnail(member.user.displayAvatarURL());
        await sendLog(member.client, member.guild.id, 'logDeparts', embedLog);
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans guildMemberRemove');
    }
  },
};
