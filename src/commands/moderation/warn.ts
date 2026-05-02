import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertir un membre.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName('membre').setDescription('Le membre à avertir').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('raison').setDescription('La raison de l\'avertissement').setRequired(true),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser('membre', true);
    const reason = interaction.options.getString('raison', true);

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: 'Tu ne peux pas t\'auto-avertir.',
        ephemeral: true,
      });
      return;
    }

    // S'assurer que la guilde existe en BDD
    await prisma.guild.upsert({
      where: { id: interaction.guildId },
      create: { id: interaction.guildId, name: interaction.guild?.name ?? 'Inconnu' },
      update: {},
    });

    const warn = await prisma.warn.create({
      data: {
        guildId: interaction.guildId,
        userId: target.id,
        modId: interaction.user.id,
        reason,
      },
    });

    const totalWarns = await prisma.warn.count({
      where: { guildId: interaction.guildId, userId: target.id },
    });

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Avertissement')
      .setColor(0xed4245)
      .setDescription(`<@${target.id}> a été averti.`)
      .addFields(
        { name: 'Raison', value: reason },
        { name: 'Avertissement n°', value: `${warn.id}`, inline: true },
        { name: 'Total des warns', value: `${totalWarns}`, inline: true },
        { name: 'Modérateur', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
