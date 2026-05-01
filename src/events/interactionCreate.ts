import { Events, MessageFlags, type Interaction, type Client } from 'discord.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: Client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Commande inconnue : ${interaction.commandName}`);
      return;
    }

    // Cooldown via Redis
    if (command.cooldown) {
      const key = `cd:${interaction.user.id}:${command.data.name}`;
      const exists = await redis.get(key);
      if (exists) {
        const ttl = await redis.ttl(key);
        await interaction.reply({
          content: `⏳ Patiente encore ${ttl}s avant de réutiliser cette commande.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await redis.set(key, '1', 'EX', command.cooldown);
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: command.data.name }, 'Erreur exécution commande');
      const replyOptions = {
        content: 'Une erreur est survenue lors de l\'exécution de cette commande.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions).catch(() => {});
      } else {
        await interaction.reply(replyOptions).catch(() => {});
      }
    }
  },
};
