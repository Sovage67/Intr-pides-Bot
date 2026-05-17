import { Events, type GuildEmoji } from 'discord.js';
import { sendLog, makeEmbed, LogColors } from '../lib/logsHelper.js';

export const emojiCreate = {
  name: Events.GuildEmojiCreate,
  async execute(emoji: GuildEmoji) {
    try {
      const embed = makeEmbed(LogColors.create, '😀 Emoji créé', `**:${emoji.name}:** ${emoji}`)
        .addFields({ name: 'ID', value: emoji.id, inline: true });
      await sendLog(emoji.client, emoji.guild.id, 'logEmojis', embed);
    } catch {}
  },
};

export const emojiDelete = {
  name: Events.GuildEmojiDelete,
  async execute(emoji: GuildEmoji) {
    try {
      const embed = makeEmbed(LogColors.remove, '🗑️ Emoji supprimé', `**:${emoji.name}:**`)
        .addFields({ name: 'ID', value: emoji.id, inline: true });
      await sendLog(emoji.client, emoji.guild.id, 'logEmojis', embed);
    } catch {}
  },
};

export const emojiUpdate = {
  name: Events.GuildEmojiUpdate,
  async execute(oldEmoji: GuildEmoji, newEmoji: GuildEmoji) {
    try {
      if (oldEmoji.name === newEmoji.name) return;
      const embed = makeEmbed(LogColors.update, '✏️ Emoji renommé')
        .addFields(
          { name: 'Avant', value: `:${oldEmoji.name}:`, inline: true },
          { name: 'Après', value: `:${newEmoji.name}: ${newEmoji}`, inline: true },
        );
      await sendLog(newEmoji.client, newEmoji.guild.id, 'logEmojis', embed);
    } catch {}
  },
};
