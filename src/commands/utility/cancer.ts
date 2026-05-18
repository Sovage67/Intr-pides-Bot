import {
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('cancer')
    .setDescription('Signale un utilisateur dans la Database ID globale. Fondateur uniquement.')
    .addUserOption(opt =>
      opt.setName('utilisateur')
        .setDescription("L'utilisateur a signaler")
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt.setName('raison')
        .setDescription('Raison du signalement')
        .setRequired(true)
        .setMaxLength(500),
    )
    .addAttachmentOption(opt =>
      opt.setName('preuve')
        .setDescription('Screenshot ou photo comme preuve')
        .setRequired(true),
    ),

  async execute(interaction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Commande utilisable uniquement dans un serveur.', ephemeral: true });
      return;
    }
    if (interaction.guild.ownerId !== interaction.user.id) {
      await interaction.reply({
        content: 'Seul le **fondateur du serveur** peut utiliser cette commande.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('utilisateur', true);
    const raison     = interaction.options.getString('raison', true);
    const preuve     = interaction.options.getAttachment('preuve', true);

    if (!preuve.contentType?.startsWith('image/')) {
      await interaction.reply({
        content: 'La preuve doit etre une image (jpg, png, gif, webp...).',
        ephemeral: true,
      });
      return;
    }
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: 'Tu ne peux pas te signaler toi-meme.', ephemeral: true });
      return;
    }
    if (targetUser.bot) {
      await interaction.reply({ content: 'Tu ne peux pas signaler un bot.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const existing = await prisma.databaseIDEntry.findUnique({ where: { targetUserId: targetUser.id } });
      if (existing) {
        const dupe = await prisma.databaseIDReport.findFirst({
          where: { entryId: existing.id, guildId: interaction.guildId!, reportedBy: interaction.user.id },
        });
        if (dupe) {
          await interaction.editReply({ content: "Tu as deja signale cet utilisateur depuis ce serveur." });
          return;
        }
      }

      const entry = await prisma.databaseIDEntry.upsert({
        where:  { targetUserId: targetUser.id },
        create: {
          targetUserId:   targetUser.id,
          targetUsername: targetUser.username,
          targetAvatar:   targetUser.displayAvatarURL({ size: 128 }),
          reportCount:    1,
        },
        update: {
          targetUsername: targetUser.username,
          targetAvatar:   targetUser.displayAvatarURL({ size: 128 }),
          reportCount:    { increment: 1 },
        },
      });

      await prisma.databaseIDReport.create({
        data: {
          entryId:        entry.id,
          guildId:        interaction.guildId!,
          guildName:      interaction.guild.name,
          reportedBy:     interaction.user.id,
          reportedByName: interaction.user.username,
          reason:         raison,
          proofImageUrl:  preuve.url,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle('Database ID — Signalement enregistre')
        .setColor(0xED4245)
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: 'Utilisateur', value: targetUser.username + ' (<@' + targetUser.id + '>)', inline: true },
          { name: 'ID Discord',  value: '`' + targetUser.id + '`',                           inline: true },
          { name: 'Signale par', value: interaction.user.username,                           inline: true },
          { name: 'Serveur',     value: interaction.guild.name,                              inline: true },
          { name: 'Raison',      value: raison },
        )
        .setImage(preuve.url)
        .setFooter({ text: 'Visible dans le dashboard -> Module Database ID' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[/cancer]', err);
      await interaction.editReply({ content: 'Une erreur est survenue. Reessaie dans un moment.' });
    }
  },
};

export default command;
