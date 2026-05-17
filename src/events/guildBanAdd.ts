import { Events, type GuildBan } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban: GuildBan) {
    try {
      const embed = makeEmbed(LogColors.ban, '🔨 Membre banni',
        `<@${ban.user.id}> **${ban.user.username}**`)
        .addFields(
          { name: 'ID', value: ban.user.id, inline: true },
          { name: 'Raison', value: ban.reason ?? '*aucune*', inline: true },
        )
        .setThumbnail(ban.user.displayAvatarURL());
      await sendLog(ban.client, ban.guild.id, 'logBans', embed);
    } catch {
      // silencieux
    }
  },
};
