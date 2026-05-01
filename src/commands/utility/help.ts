import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder().setName('help').setDescription('Affiche la liste des commandes.'),
  async execute(interaction) {
    const commands = interaction.client.commands;

    const categories: Record<string, string[]> = {
      Économie: [],
      Modération: [],
      Utilitaire: [],
    };

    for (const cmd of commands.values()) {
      const name = cmd.data.name;
      const desc = (cmd.data as { description?: string }).description ?? '';
      // Catégorisation simple basée sur le nom (à améliorer si besoin)
      if (['daily', 'work', 'balance', 'leaderboard'].includes(name)) {
        categories.Économie!.push(`\`/${name}\` — ${desc}`);
      } else if (['warn', 'kick', 'ban'].includes(name)) {
        categories.Modération!.push(`\`/${name}\` — ${desc}`);
      } else {
        categories.Utilitaire!.push(`\`/${name}\` — ${desc}`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('📖 Liste des commandes')
      .setColor(0x5865f2)
      .setDescription(
        'Voici toutes les commandes disponibles. Configure le bot sur le [dashboard](https://votre-site.com).',
      );

    for (const [cat, cmds] of Object.entries(categories)) {
      if (cmds.length > 0) {
        embed.addFields({ name: cat, value: cmds.join('\n') });
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
