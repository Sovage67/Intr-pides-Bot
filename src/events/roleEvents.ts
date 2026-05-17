import { Events, type Role } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export const roleCreate = {
  name: Events.GuildRoleCreate,
  async execute(role: Role) {
    try {
      const embed = makeEmbed(LogColors.create, '🎭 Rôle créé', `**${role.name}**`)
        .addFields({ name: 'ID', value: role.id, inline: true });
      await sendLog(role.client, role.guild.id, 'logRolesGestion', embed);
    } catch {}
  },
};

export const roleDelete = {
  name: Events.GuildRoleDelete,
  async execute(role: Role) {
    try {
      const embed = makeEmbed(LogColors.remove, '🗑️ Rôle supprimé', `**${role.name}**`)
        .addFields({ name: 'ID', value: role.id, inline: true });
      await sendLog(role.client, role.guild.id, 'logRolesGestion', embed);
    } catch {}
  },
};

export const roleUpdate = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole: Role, newRole: Role) {
    try {
      if (oldRole.name === newRole.name && oldRole.color === newRole.color) return;
      const embed = makeEmbed(LogColors.update, '✏️ Rôle modifié', `**${newRole.name}**`)
        .addFields({ name: 'ID', value: newRole.id, inline: true });
      if (oldRole.name !== newRole.name) embed.addFields({ name: 'Nom', value: `${oldRole.name} → ${newRole.name}`, inline: true });
      await sendLog(newRole.client, newRole.guild.id, 'logRolesGestion', embed);
    } catch {}
  },
};
