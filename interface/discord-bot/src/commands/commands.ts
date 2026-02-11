// interface\discord-bot\src\commands\commands.ts
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

export const reviewData = new SlashCommandBuilder()
  .setName("review_latest_commit")
  .setDescription("Review the most recent commit");

export async function executeReview(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();

    const response = await axios.get(`${BACKEND_URL}/reviews/latest`);
    const data = response.data;
    const review = data.review;

    const output = [
      `**Commit:** \`${data.commit_hash.substring(0, 7)}\` (reviewed by ${data.provider})`,
      `**Alignment Score:** ${review.alignment_score.toFixed(2)}`,
      `**Quality:** ${review.execution_quality}`,
      ``,
      `**Summary:**`,
      review.summary,
      ``,
      ...(review.architecture_issues.length > 0
        ? [
            `**Architecture Issues:**`,
            ...review.architecture_issues.map((issue: string) => `- ${issue}`),
          ]
        : []),
      ...(review.code_smells.length > 0
        ? [
            `**Code Smells:**`,
            ...review.code_smells.map((smell: string) => `- ${smell}`),
          ]
        : []),
      ``,
      `**Recommended Action:**`,
      review.recommended_action,
    ].join("\n");

    await interaction.editReply(output);
  } catch (error: any) {
    console.error("Failed to fetch review:", error);
    if (error.response?.status === 404) {
      await interaction.editReply(
        "No reviews found. Run /goal add and make a commit first.",
      );
    } else {
      await interaction.editReply("Failed to fetch review");
    }
  }
}

export const enforceData = new SlashCommandBuilder()
  .setName("enforce")
  .setDescription("Manually trigger enforcement check");

export async function executeEnforce(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();

    const response = await axios.post(`${BACKEND_URL}/enforcement/trigger`);
    const data = response.data;

    if (data.ran) {
      await interaction.editReply(
        "Enforcement check completed. Check channel for warnings.",
      );
    } else {
      await interaction.editReply("Enforcement already ran today.");
    }
  } catch (error) {
    console.error("Failed to trigger enforcement:", error);
    await interaction.editReply("Failed to trigger enforcement");
  }
}
