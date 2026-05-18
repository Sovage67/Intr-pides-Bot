import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';
import { prisma } from '../lib/prisma.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    try {
      const guildId = newMember.guild.id;

      // ── Protection pseudo bot (premium requis) ────────────────────────────────
      const botId = newMember.client.user?.id;
      if (botId && newMember.id === botId && oldMember.nickname !== newMember.nickname) {
        const guild = await prisma.guild.findUnique({ where: { id: guildId } });
        const hasPremium = guild?.premium && (!guild.premiumUntil || guild.premiumUntil > new Date());
        if (!hasPremium) {
          try {
            await newMember.setNickname(oldMember.nickname ?? null, 'Premium requis pour changer le pseudo du bot');
            // Tenter d'envoyer un message au fondateur
            const owner = await newMember.guild.fetchOwner().catch(() => null);
            if (owner) {
              await owner.send(
                'Le pseudo du bot ne peut pas etre modifie sans le premium. Active le premium dans le dashboard : https://intrepides.vercel.app'
              ).catch(() => null);
            }
          } catch {
            // silencieux si pas les permissions
          }
          return;
        }
      }

      // ── Log pseudo ──────────────────────────────────────────────────────────
      if (oldMember.nickname !== newMember.nickname) {
        const embed = makeEmbed(LogColors.update, '✏️ Pseudo modifié',
          `<@${newMember.id}> **${newMember.user?.username ?? newMember.id}**`)
          .addFields(
            { name: 'Avant', value: oldMember.nickname ?? '*aucun*', inline: true },
            { name: 'Après', value: newMember.nickname ?? '*aucun*', inline: true },
          );
        await sendLog(newMember.client, guildId, 'logPseudos', embed);
      }

      // ── Log rôles attribués/retirés ─────────────────────────────────────────
      const oldRoles = oldMember.roles?.cache ?? new Map();
      const newRoles = newMember.roles?.cache ?? new Map();

      const added   = [...newRoles.values()].filter(r => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
      const removed = [...oldRoles.values()].filter(r => !newRoles.has(r.id) && r.id !== newMember.guild.id);

      if (added.length > 0 || removed.length > 0) {
        const embed = makeEmbed(LogColors.update, '🎭 Rôles modifiés',
          `<@${newMember.id}> **${newMember.user?.username ?? newMember.id}**`);
        if (added.length)   embed.addFields({ name: '➕ Ajoutés',  value: added.map(r => `<@&${r.id}>`).join(' '),   inline: true });
        if (removed.length) embed.addFields({ name: '➖ Retirés', value: removed.map(r => `<@&${r.id}>`).join(' '), inline: true });
        await sendLog(newMember.client, guildId, 'logRolesAttrib', embed);
      }
    } catch {
      // silencieux
    }
  },
};
