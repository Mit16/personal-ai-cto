// interface\discord-bot\src\commands\goal.ts
import { SlashCommandBuilder } from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import axios from "axios";
import { BACKEND_URL } from "../config/config.js";

export const data = new SlashCommandBuilder()
  .setName("goal")
  .setDescription("Manage goals")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a new goal")
      .addStringOption((option) =>
        option.setName("title").setDescription("Goal title").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription("Goal description")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List active goals"),
  );

export const statusData = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show commit activity and goals");

export async function executeGoal(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "add") {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");

    try {
      const response = await axios.post(`${BACKEND_URL}/goals`, {
        title,
        description,
      });

      await interaction.reply(`Goal added: ${response.data.title}`);
    } catch (error) {
      console.error("Failed to add goal:", error);
      await interaction.reply("Failed to add goal");
    }
  }

  if (subcommand === "list") {
    try {
      const response = await axios.get(`${BACKEND_URL}/goals`);
      const goals = response.data;

      if (goals.length === 0) {
        await interaction.reply("No active goals");
        return;
      }

      const output = goals
        .map(
          (g: any, i: number) =>
            `${i + 1}. **${g.title}**${g.description ? `\n   ${g.description}` : ""}`,
        )
        .join("\n\n");

      await interaction.reply(output);
    } catch (error) {
      console.error("Failed to fetch goals:", error);
      await interaction.reply("Failed to fetch goals");
    }
  }
}

export async function executeStatus(interaction: ChatInputCommandInteraction) {
  try {
    const response = await axios.get(`${BACKEND_URL}/commits/stats`);
    const stats = response.data;

    const output = [
      `**Commits today:** ${stats.commits_today}`,
      `**Commits last 7 days:** ${stats.commits_last_7_days}`,
      `**Active goals:** ${stats.active_goals}`,
    ].join("\n");

    await interaction.reply(output);
  } catch (error) {
    console.error("Failed to fetch status:", error);
    await interaction.reply("Failed to fetch status");
  }
}
