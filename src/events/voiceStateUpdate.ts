import { Events, type VoiceState } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState) {
    try {
      const guildId = newState.guild.id;
      const member = newState.member;
      if (!member || member.user.bot) return;

      const name = `<@${member.id}> **${member.user.username}**`;

      if (!oldState.channelId && newState.channelId) {
        // Connexion
        const embed = makeEmbed(LogColors.voice, '🔊 Connexion vocale', name)
          .addFields({ name: 'Salon', value: `<#${newState.channelId}>`, inline: true });
        await sendLog(member.client, guildId, 'logVocal', embed);
      } else if (oldState.channelId && !newState.channelId) {
        // Déconnexion
        const embed = makeEmbed(LogColors.leave, '🔇 Déconnexion vocale', name)
          .addFields({ name: 'Salon quitté', value: `<#${oldState.channelId}>`, inline: true });
        await sendLog(member.client, guildId, 'logVocal', embed);
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // Déplacement
        const embed = makeEmbed(LogColors.update, '🔀 Déplacement vocal', name)
          .addFields(
            { name: 'Depuis', value: `<#${oldState.channelId}>`, inline: true },
            { name: 'Vers',   value: `<#${newState.channelId}>`, inline: true },
          );
        await sendLog(member.client, guildId, 'logVocal', embed);
      }
    } catch {
      // silencieux
    }
  },
};
