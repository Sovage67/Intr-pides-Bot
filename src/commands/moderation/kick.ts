import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { checkCooldown } from '../../lib/cooldown.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName('membre').setDescription('Le membre à expulser').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('raison').setDescription('La raison').setRequired(false),
    ),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    // Cooldown : 1 kick toutes les 5 secondes par modérateur
    const remaining = await checkCooldown(interaction.user.id, 'kick', 5);
    if (remaining) {
      await interaction.reply({ content: `⏳ Cooldown actif, réessaie dans **${remaining}s**.`, ephemeral: true });
      return;
    }

    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

    if (!target || !('kickable' in target)) {
      await interaction.reply({
        content: 'Membre introuvable.',
        ephemeral: true,
      });
      return;
    }

    if (!target.kickable) {
      await interaction.reply({
        content: 'Je ne peux pas expulser ce membre (rang trop élevé ou permissions manquantes).',
        ephemeral: true,
      });
      return;
    }

    await target.kick(`${interaction.user.tag} : ${reason}`);

    const embed = new EmbedBuilder()
      .setTitle('👢 Membre expulsé')
      .setColor(0xed4245)
      .addFields(
        { name: 'Membre', value: `${target.user.tag} (${target.id})` },
        { name: 'Raison', value: reason },
        { name: 'Modérateur', value: `<@${interaction.user.id}>` },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
