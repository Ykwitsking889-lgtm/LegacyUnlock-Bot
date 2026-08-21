require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Collection
} = require("discord.js");

/* =========================================================
   CONFIG
========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
    console.error("Missing DISCORD_TOKEN, CLIENT_ID, or OWNER_ID in .env");
    process.exit(1);
}

const CONFIG = {
    botName: "LegacyUnlock",

    ticketCategoryName: "Tickets",
    applicationCategoryName: "Applications",

    supportRoleName: "Support Team",
    adminRoleName: "Admin",
    moderatorRoleName: "Moderator",

    logChannelName: "bot-logs",

    minimumPassingScore: 5.5,

    maxApplicationQuestions: 10
};

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember
    ]
});

client.commands = new Collection();

/* =========================================================
   APPLICATION DATA
========================================================= */

const applications = new Map();

/* =========================================================
   HELPERS
========================================================= */

function isOwner(interaction) {
    return interaction.user.id === OWNER_ID;
}

function hasAdmin(interaction) {
    return (
        isOwner(interaction) ||
        interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function hasModeration(interaction) {
    return (
        isOwner(interaction) ||
        interaction.member.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        )
    );
}

async function getOrCreateRole(guild, roleName, color = null) {
    let role = guild.roles.cache.find(
        r => r.name.toLowerCase() === roleName.toLowerCase()
    );

    if (!role) {
        role = await guild.roles.create({
            name: roleName,
            color: color || undefined,
            reason: "LegacyUnlock automatic setup"
        });
    }

    return role;
}

async function getOrCreateCategory(guild, name) {
    let category = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildCategory &&
            c.name.toLowerCase() === name.toLowerCase()
    );

    if (!category) {
        category = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory
        });
    }

    return category;
}

async function getOrCreateLogChannel(guild) {
    let channel = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildText &&
            c.name.toLowerCase() === CONFIG.logChannelName
    );

    if (!channel) {
        channel = await guild.channels.create({
            name: CONFIG.logChannelName,
            type: ChannelType.GuildText
        });
    }

    return channel;
}

async function sendLog(guild, title, description, color = 0x5865F2) {
    try {
        const channel = await getOrCreateLogChannel(guild);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Logging error:", error);
    }
}

function safeChannelName(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

/* =========================================================
   APPLICATION QUESTIONS
========================================================= */

const ROLE_TESTS = {
    tester: [
        "What makes a good Discord community tester?",
        "How would you report a bug?",
        "What information should a bug report contain?",
        "What would you do if you discovered an exploit?",
        "How would you test a new feature?",
        "How do you reproduce a bug?",
        "Why is testing important?",
        "How would you handle a bug that only happens sometimes?",
        "What would you do if another tester disagreed with your report?",
        "Why should we choose you as a tester?"
    ],

    moderator: [
        "What makes a good moderator?",
        "How would you handle an argument?",
        "What would you do if a member broke a rule?",
        "How should warnings be handled?",
        "What would you do if someone insulted you?",
        "How would you handle spam?",
        "What is abuse of moderator permissions?",
        "When should you escalate an issue?",
        "How should private moderation information be handled?",
        "Why should we choose you as a moderator?"
    ],

    support: [
        "What makes good support?",
        "How would you respond to an angry user?",
        "What would you do if you did not know the answer?",
        "How should support tickets be handled?",
        "Why is communication important?",
        "How would you handle multiple tickets?",
        "What information should remain private?",
        "When should an issue be escalated?",
        "How would you deal with a rude user?",
        "Why should we choose you for support?"
    ],

    developer: [
        "What programming languages do you know?",
        "How do you debug an error?",
        "How do you keep code organized?",
        "What is version control?",
        "How do you handle a bug in production?",
        "Why is security important?",
        "How do you test code?",
        "How would you explain a technical issue to a non-technical user?",
        "How do you handle code review?",
        "Why should we choose you as a developer?"
    ]
};

/* =========================================================
   SIMPLE ANSWER RATING ENGINE
========================================================= */

function rateAnswer(answer) {
    if (!answer || answer.trim().length === 0) {
        return 1;
    }

    const text = answer.trim();

    let score = 1;

    if (text.length >= 20) score += 1;
    if (text.length >= 50) score += 1;
    if (text.length >= 100) score += 1;

    const usefulWords = [
        "because",
        "example",
        "would",
        "should",
        "report",
        "communicate",
        "respect",
        "help",
        "rules",
        "problem",
        "solution",
        "team",
        "test",
        "support",
        "evidence",
        "reason"
    ];

    for (const word of usefulWords) {
        if (text.toLowerCase().includes(word)) {
            score += 0.25;
        }
    }

    score = Math.min(10, Math.round(score * 4) / 4);

    return score;
}

/* =========================================================
   COMMANDS
========================================================= */

const commands = [

    /* =========================
       GENERAL
    ========================= */

new SlashCommandBuilder()
    .setName("setwelcome")
    .setDescription("Set the channel for automatic welcome messages")
    .addChannelOption(option =>
        option
            .setName("channel")
            .setDescription("Channel where welcome messages will be sent")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    ),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check the bot latency"),

    new SlashCommandBuilder()
        .setName("botinfo")
        .setDescription("Show information about the bot"),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Show server information"),

    new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Show information about a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member to inspect")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Show a member's avatar")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show bot commands"),

    /* =========================
       MODERATION
    ========================= */

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member to kick")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member to ban")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user")
        .addStringOption(option =>
            option
                .setName("userid")
                .setDescription("User ID")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("minutes")
                .setDescription("Timeout duration")
                .setMinValue(1)
                .setMaxValue(40320)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Member")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete messages")
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Number of messages")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    /* =========================
       TICKETS
    ========================= */

    new SlashCommandBuilder()
        .setName("ticketpanel")
        .setDescription("Create the ticket panel"),

    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Create a ticket"),

    new SlashCommandBuilder()
        .setName("ticketclose")
        .setDescription("Close the current ticket"),

    new SlashCommandBuilder()
        .setName("ticketdelete")
        .setDescription("Delete the current ticket"),

    new SlashCommandBuilder()
        .setName("ticketclaim")
        .setDescription("Claim the current ticket"),

    /* =========================
       APPLICATIONS
    ========================= */

    new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Start a staff application"),

    new SlashCommandBuilder()
        .setName("applicationpanel")
        .setDescription("Create the application panel"),

    new SlashCommandBuilder()
        .setName("applications")
        .setDescription("View application system information"),

    /* =========================
       OWNER
    ========================= */

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Set up the bot automatically"),

    new SlashCommandBuilder()
        .setName("setlogs")
        .setDescription("Create the logging channel"),

    new SlashCommandBuilder()
        .setName("setuptickets")
        .setDescription("Set up the ticket system"),

    new SlashCommandBuilder()
        .setName("setupapplications")
        .setDescription("Set up the application system")
];

/* =========================================================
   COMMAND REGISTRATION
========================================================= */
async function registerCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(TOKEN);

        // Remove duplicate command names
        const uniqueCommands = [];
        const seen = new Set();

        for (const command of commands) {
            const data = command.toJSON();

            if (seen.has(data.name)) {
                console.log(`Removed duplicate command: /${data.name}`);
                continue;
            }

            seen.add(data.name);
            uniqueCommands.push(data);
        }

        console.log(
            `Registering ${uniqueCommands.length} unique GLOBAL slash commands...`
        );

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: uniqueCommands
            }
        );

        console.log(
            `Successfully registered ${uniqueCommands.length} unique global commands.`
        );

    } catch (error) {
        console.error("Command registration failed:", error);
    }
}

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {

    console.log("======================================");
    console.log(`${CONFIG.botName} is ONLINE`);
    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`Servers: ${client.guilds.cache.size}`);
    console.log(`Commands: ${commands.length}`);
    console.log("======================================");

    client.user.setPresence({
        activities: [
            {
                name: "Tickets & Applications",
                type: 3
            }
        ],
        status: "online"
    });

    await registerCommands();

    for (const guild of client.guilds.cache.values()) {
        try {
            await getOrCreateLogChannel(guild);
        } catch (error) {
            console.error(
                `Could not create log channel in ${guild.name}`,
                error.message
            );
        }
    }
});

/* =========================================================
   INTERACTION HANDLER
========================================================= */

client.on("interactionCreate", async interaction => {

    try {

        /* =================================================
           SLASH COMMANDS
        ================================================= */

        if (interaction.isChatInputCommand()) {

            const command = interaction.commandName;

            /* =========================
               GENERAL
            ========================= */

if (command === "setwelcome") {

    if (!hasAdmin(interaction)) {
        return interaction.reply({
            content: "You need Administrator permission to use this command.",
            ephemeral: true
        });
    }

    const channel =
        interaction.options.getChannel("channel");

    if (
        channel.type !== ChannelType.GuildText
    ) {
        return interaction.reply({
            content: "Please select a text channel.",
            ephemeral: true
        });
    }

    welcomeChannels.set(
        interaction.guild.id,
        channel.id
    );

    await sendLog(
        interaction.guild,
        "Welcome Channel Updated",
        `**Channel:** ${channel}\n` +
        `**Changed by:** ${interaction.user.tag}`,
        0x57F287
    );

    return interaction.reply({
        content:
            `Welcome messages are now set to ${channel}.`,
        ephemeral: true
    });
}

            if (command === "ping") {

                return interaction.reply({
                    content: `Pong! **${client.ws.ping}ms**`,
                    ephemeral: true
                });
            }

            if (command === "botinfo") {

                const embed = new EmbedBuilder()
                    .setTitle(`${CONFIG.botName}`)
                    .setDescription(
                        "Advanced Discord moderation, ticket and application system."
                    )
                    .addFields(
                        {
                            name: "Servers",
                            value: `${client.guilds.cache.size}`,
                            inline: true
                        },
                        {
                            name: "Commands",
                            value: `${commands.length}`,
                            inline: true
                        },
                        {
                            name: "Ping",
                            value: `${client.ws.ping}ms`,
                            inline: true
                        }
                    )
                    .setColor(0x5865F2);

                return interaction.reply({
                    embeds: [embed]
                });
            }

            if (command === "serverinfo") {

                const guild = interaction.guild;

                const embed = new EmbedBuilder()
                    .setTitle(guild.name)
                    .addFields(
                        {
                            name: "Members",
                            value: `${guild.memberCount}`,
                            inline: true
                        },
                        {
                            name: "Channels",
                            value: `${guild.channels.cache.size}`,
                            inline: true
                        },
                        {
                            name: "Roles",
                            value: `${guild.roles.cache.size}`,
                            inline: true
                        }
                    )
                    .setColor(0x5865F2);

                return interaction.reply({
                    embeds: [embed]
                });
            }

            if (command === "userinfo") {

                const user =
                    interaction.options.getUser("user") ||
                    interaction.user;

                const member =
                    await interaction.guild.members
                        .fetch(user.id)
                        .catch(() => null);

                const embed = new EmbedBuilder()
                    .setTitle(user.tag)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        {
                            name: "User ID",
                            value: user.id
                        },
                        {
                            name: "Joined Server",
                            value: member
                                ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                                : "Unknown"
                        },
                        {
                            name: "Account Created",
                            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`
                        }
                    )
                    .setColor(0x5865F2);

                return interaction.reply({
                    embeds: [embed]
                });
            }

            if (command === "avatar") {

                const user =
                    interaction.options.getUser("user") ||
                    interaction.user;

                return interaction.reply({
                    content: user.displayAvatarURL({
                        size: 4096,
                        extension: "png"
                    })
                });
            }

            if (command === "help") {

                const embed = new EmbedBuilder()
                    .setTitle(`${CONFIG.botName} Commands`)
                    .setDescription(
                        [
                            "**General**",
                            "`/ping` `/botinfo` `/serverinfo` `/userinfo` `/avatar` `/help`",
                            "",
                            "**Moderation**",
                            "`/kick` `/ban` `/unban` `/timeout` `/warn` `/clear`",
                            "",
                            "**Tickets**",
                            "`/ticketpanel` `/ticket` `/ticketclaim` `/ticketclose` `/ticketdelete`",
                            "",
                            "**Applications**",
                            "`/apply` `/applicationpanel` `/applications`",
                            "",
                            "**Setup**",
                            "`/setup` `/setlogs` `/setuptickets` `/setupapplications`"
                        ].join("\n")
                    )
                    .setColor(0x5865F2);

                return interaction.reply({
                    embeds: [embed]
                });
            }

            /* =========================
               PERMISSION CHECK
            ========================= */

            if (
                [
                    "kick",
                    "ban",
                    "unban",
                    "timeout",
                    "warn",
                    "clear"
                ].includes(command)
            ) {
                if (!hasModeration(interaction)) {
                    return interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });
                }
            }

            /* =========================
               KICK
            ========================= */

            if (command === "kick") {

                const user = interaction.options.getUser("user");
                const reason =
                    interaction.options.getString("reason") ||
                    "No reason provided.";

                const member =
                    await interaction.guild.members
                        .fetch(user.id)
                        .catch(() => null);

                if (!member) {
                    return interaction.reply({
                        content: "That member is not in the server.",
                        ephemeral: true
                    });
                }

                if (!member.kickable) {
                    return interaction.reply({
                        content: "I cannot kick that member.",
                        ephemeral: true
                    });
                }

                await member.kick(reason);

                await sendLog(
                    interaction.guild,
                    "Member Kicked",
                    `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`,
                    0xED4245
                );

                return interaction.reply({
                    content: `Kicked **${user.tag}**.`
                });
            }

            /* =========================
               BAN
            ========================= */

            if (command === "ban") {

                const user = interaction.options.getUser("user");
                const reason =
                    interaction.options.getString("reason") ||
                    "No reason provided.";

                const member =
                    await interaction.guild.members
                        .fetch(user.id)
                        .catch(() => null);

                if (member && !member.bannable) {
                    return interaction.reply({
                        content: "I cannot ban that member.",
                        ephemeral: true
                    });
                }

                await interaction.guild.members.ban(user.id, {
                    reason
                });

                await sendLog(
                    interaction.guild,
                    "Member Banned",
                    `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`,
                    0xED4245
                );

                return interaction.reply({
                    content: `Banned **${user.tag}**.`
                });
            }

            /* =========================
               UNBAN
            ========================= */

            if (command === "unban") {

                const userId =
                    interaction.options.getString("userid");

                try {

                    await interaction.guild.members.unban(userId);

                    await sendLog(
                        interaction.guild,
                        "Member Unbanned",
                        `**User ID:** ${userId}\n**Moderator:** ${interaction.user.tag}`,
                        0x57F287
                    );

                    return interaction.reply({
                        content: `Unbanned **${userId}**.`
                    });

                } catch {
                    return interaction.reply({
                        content: "That user is not banned or the ID is invalid.",
                        ephemeral: true
                    });
                }
            }

            /* =========================
               TIMEOUT
            ========================= */

            if (command === "timeout") {

                const user =
                    interaction.options.getUser("user");

                const minutes =
                    interaction.options.getInteger("minutes");

                const reason =
                    interaction.options.getString("reason") ||
                    "No reason provided.";

                const member =
                    await interaction.guild.members
                        .fetch(user.id)
                        .catch(() => null);

                if (!member) {
                    return interaction.reply({
                        content: "Member not found.",
                        ephemeral: true
                    });
                }

                if (!member.moderatable) {
                    return interaction.reply({
                        content: "I cannot timeout that member.",
                        ephemeral: true
                    });
                }

                await member.timeout(
                    minutes * 60 * 1000,
                    reason
                );

                await sendLog(
                    interaction.guild,
                    "Member Timed Out",
                    `**User:** ${user.tag}\n**Duration:** ${minutes} minutes\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`,
                    0xFEE75C
                );

                return interaction.reply({
                    content: `Timed out **${user.tag}** for ${minutes} minutes.`
                });
            }

            /* =========================
               WARN
            ========================= */

            if (command === "warn") {

                const user =
                    interaction.options.getUser("user");

                const reason =
                    interaction.options.getString("reason");

                await sendLog(
                    interaction.guild,
                    "Member Warned",
                    `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`,
                    0xFEE75C
                );

                return interaction.reply({
                    content: `Warned **${user.tag}**.\nReason: ${reason}`
                });
            }

            /* =========================
               CLEAR
            ========================= */

            if (command === "clear") {

                const amount =
                    interaction.options.getInteger("amount");

                const deleted =
                    await interaction.channel.bulkDelete(
                        amount,
                        true
                    );

                return interaction.reply({
                    content: `Deleted **${deleted.size}** messages.`,
                    ephemeral: true
                });
            }

            /* =========================
               OWNER CHECK
            ========================= */

            if (
                [
                    "ticketpanel",
                    "applicationpanel",
                    "setup",
                    "setlogs",
                    "setuptickets",
                    "setupapplications"
                ].includes(command)
            ) {

                if (!hasAdmin(interaction)) {
                    return interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });
                }
            }

            /* =========================
               SET LOGS
            ========================= */

            if (command === "setlogs") {

                const channel =
                    await getOrCreateLogChannel(
                        interaction.guild
                    );

                return interaction.reply({
                    content: `Logging channel is ${channel}.`,
                    ephemeral: true
                });
            }

            /* =========================
               SETUP
            ========================= */

            if (command === "setup") {

                await getOrCreateRole(
                    interaction.guild,
                    CONFIG.supportRoleName,
                    0x5865F2
                );

                await getOrCreateRole(
                    interaction.guild,
                    CONFIG.adminRoleName,
                    0xED4245
                );

                await getOrCreateRole(
                    interaction.guild,
                    CONFIG.moderatorRoleName,
                    0xFEE75C
                );

                await getOrCreateCategory(
                    interaction.guild,
                    CONFIG.ticketCategoryName
                );

                await getOrCreateCategory(
                    interaction.guild,
                    CONFIG.applicationCategoryName
                );

                await getOrCreateLogChannel(
                    interaction.guild
                );

                await sendLog(
                    interaction.guild,
                    "Bot Setup Completed",
                    `Setup completed by **${interaction.user.tag}**.`,
                    0x57F287
                );

                return interaction.reply({
                    content:
                        "Full basic setup completed.\n\n" +
                        "Created/verified:\n" +
                        "• Support Team role\n" +
                        "• Admin role\n" +
                        "• Moderator role\n" +
                        "• Tickets category\n" +
                        "• Applications category\n" +
                        "• Logging channel",
                    ephemeral: true
                });
            }

            /* =========================
               SETUP TICKETS
            ========================= */

            if (command === "setuptickets") {

                await getOrCreateRole(
                    interaction.guild,
                    CONFIG.supportRoleName,
                    0x5865F2
                );

                await getOrCreateCategory(
                    interaction.guild,
                    CONFIG.ticketCategoryName
                );

                return interaction.reply({
                    content: "Ticket system setup completed.",
                    ephemeral: true
                });
            }

            /* =========================
               SETUP APPLICATIONS
            ========================= */

            if (command === "setupapplications") {

                await getOrCreateCategory(
                    interaction.guild,
                    CONFIG.applicationCategoryName
                );

                return interaction.reply({
                    content:
                        "Application system setup completed.",
                    ephemeral: true
                });
            }

            /* =========================
               TICKET PANEL
            ========================= */

            if (command === "ticketpanel") {

                const embed = new EmbedBuilder()
                    .setTitle("Support Tickets")
                    .setDescription(
                        "Need help? Open a ticket below.\n\n" +
                        "A support member will be notified when your ticket is created."
                    )
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId("create_ticket")
                            .setLabel("Open Ticket")
                            .setEmoji("🎫")
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.channel.send({
                    embeds: [embed],
                    components: [row]
                });

                return interaction.reply({
                    content: "Ticket panel created.",
                    ephemeral: true
                });
            }

            /* =========================
               TICKET COMMAND
            ========================= */

            if (command === "ticket") {

                return createTicket(interaction);
            }

            /* =========================
               TICKET CLAIM
            ========================= */

            if (command === "ticketclaim") {

                return claimTicket(interaction);
            }

            /* =========================
               TICKET CLOSE
            ========================= */

            if (command === "ticketclose") {

                return closeTicket(interaction);
            }

            /* =========================
               TICKET DELETE
            ========================= */

            if (command === "ticketdelete") {

                return deleteTicket(interaction);
            }

            /* =========================
               APPLICATION PANEL
            ========================= */

            if (command === "applicationpanel") {

                const embed = new EmbedBuilder()
                    .setTitle("Staff Applications")
                    .setDescription(
                        "Choose the staff position you want to apply for."
                    )
                    .setColor(0x5865F2);

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId("application_role")
                        .setPlaceholder("Choose a position")
                        .addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel("Tester")
                                .setDescription("Apply for Tester")
                                .setValue("tester")
                                .setEmoji("🧪"),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Moderator")
                                .setDescription("Apply for Moderator")
                                .setValue("moderator")
                                .setEmoji("🛡️"),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Support")
                                .setDescription("Apply for Support")
                                .setValue("support")
                                .setEmoji("🎧"),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Developer")
                                .setDescription("Apply for Developer")
                                .setValue("developer")
                                .setEmoji("💻")
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(menu);

                await interaction.channel.send({
                    embeds: [embed],
                    components: [row]
                });

                return interaction.reply({
                    content: "Application panel created.",
                    ephemeral: true
                });
            }

            /* =========================
               APPLY
            ========================= */

            if (command === "apply") {

                return interaction.reply({
                    content:
                        "Use the application panel to select the position you want to apply for.",
                    ephemeral: true
                });
            }

            /* =========================
               APPLICATION INFO
            ========================= */

            if (command === "applications") {

                return interaction.reply({
                    content:
                        "**Available positions:**\n" +
                        "🧪 Tester\n" +
                        "🛡️ Moderator\n" +
                        "🎧 Support\n" +
                        "💻 Developer\n\n" +
                        "Each application contains 10 questions and every answer receives a 1–10 score.",
                    ephemeral: true
                });
            }
        }

        /* =================================================
           BUTTONS
        ================================================= */

       if (interaction.isButton()) {

    if (interaction.replied || interaction.deferred) {
        return;
    }

            if (interaction.customId === "create_ticket") {
                return createTicket(interaction);
            }

            if (interaction.customId === "claim_ticket") {
                return claimTicket(interaction);
            }

            if (interaction.customId === "close_ticket") {
                return closeTicket(interaction);
            }

            if (interaction.customId === "delete_ticket") {
                return deleteTicket(interaction);
            }

            if (interaction.customId === "start_application") {

                return startApplication(
                    interaction,
                    interaction.customId.split("_")[2]
                );
            }
        }

        /* =================================================
           APPLICATION SELECT MENU
        ================================================= */

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === "application_role"
        ) {

            const role = interaction.values[0];

            return startApplication(
                interaction,
                role
            );
        }

        /* =================================================
           APPLICATION MODAL
        ================================================= */

        if (
    interaction.isModalSubmit() &&
    (
        interaction.customId.startsWith("application_") ||
        interaction.customId.startsWith("application2_")
    )
) {

            return submitApplication(interaction);
        }

    } catch (error) {

        console.error("Interaction error:", error);

        if (interaction.replied || interaction.deferred) {

            await interaction.followUp({
                content:
                    "An unexpected error occurred.",
                ephemeral: true
            }).catch(() => {});

        } else {

            await interaction.reply({
                content:
                    "An unexpected error occurred.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

/* =========================================================
   CREATE TICKET
========================================================= */

async function createTicket(interaction) {

    const guild = interaction.guild;
    const user = interaction.user;

    const existing = guild.channels.cache.find(
        channel =>
            channel.name ===
            `ticket-${safeChannelName(user.username)}`
    );

    if (existing) {

        return interaction.reply({
            content: `You already have a ticket: ${existing}`,
            ephemeral: true
        });
    }

    const category =
        await getOrCreateCategory(
            guild,
            CONFIG.ticketCategoryName
        );

    const supportRole =
        await getOrCreateRole(
            guild,
            CONFIG.supportRoleName
        );

    const channel =
        await guild.channels.create({
            name: `ticket-${safeChannelName(user.username)}`,
            type: ChannelType.GuildText,
            parent: category.id,

            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel
                    ]
                },

                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },

                {
                    id: supportRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageMessages
                    ]
                }
            ]
        });

    const embed = new EmbedBuilder()
        .setTitle("Support Ticket")
        .setDescription(
            `Welcome ${user}.\n\n` +
            "Please explain what you need help with.\n" +
            "A support member will be with you shortly."
        )
        .setColor(0x5865F2)
        .setFooter({
            text: "LegacyUnlock Ticket System"
        });

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("claim_ticket")
                    .setLabel("Claim")
                    .setEmoji("🙋")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("Close")
                    .setEmoji("🔒")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("delete_ticket")
                    .setLabel("Delete")
                    .setEmoji("🗑️")
                    .setStyle(ButtonStyle.Danger)
            );

    await channel.send({
        content: `${user} <@&${supportRole.id}>`,
        embeds: [embed],
        components: [row]
    });

    await sendLog(
        guild,
        "Ticket Created",
        `**User:** ${user.tag}\n**Channel:** ${channel}`,
        0x57F287
    );

    return interaction.reply({
        content: `Your ticket has been created: ${channel}`,
        ephemeral: true
    });
}

/* =========================================================
   CLAIM TICKET
========================================================= */

async function claimTicket(interaction) {

    if (!interaction.channel.name.startsWith("ticket-")) {

        return interaction.reply({
            content: "This is not a ticket channel.",
            ephemeral: true
        });
    }

    const supportRole =
        interaction.guild.roles.cache.find(
            role =>
                role.name.toLowerCase() ===
                CONFIG.supportRoleName.toLowerCase()
        );

    if (
        !isOwner(interaction) &&
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        ) &&
        (!supportRole ||
            !interaction.member.roles.cache.has(supportRole.id))
    ) {

        return interaction.reply({
            content: "Only the support team can claim tickets.",
            ephemeral: true
        });
    }

    await interaction.channel.setTopic(
        `Claimed by ${interaction.user.tag}`
    );

    await sendLog(
        interaction.guild,
        "Ticket Claimed",
        `**Ticket:** ${interaction.channel}\n**Claimed by:** ${interaction.user.tag}`,
        0x57F287
    );

    return interaction.reply({
        content: `This ticket has been claimed by ${interaction.user}.`
    });
}

/* =========================================================
   CLOSE TICKET
========================================================= */

async function closeTicket(interaction) {

    if (!interaction.channel.name.startsWith("ticket-")) {

        return interaction.reply({
            content: "This is not a ticket channel.",
            ephemeral: true
        });
    }

    if (
        !hasAdmin(interaction) &&
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )
    ) {

        const supportRole =
            interaction.guild.roles.cache.find(
                role =>
                    role.name.toLowerCase() ===
                    CONFIG.supportRoleName.toLowerCase()
            );

        if (
            !supportRole ||
            !interaction.member.roles.cache.has(
                supportRole.id
            )
        ) {

            return interaction.reply({
                content: "You cannot close this ticket.",
                ephemeral: true
            });
        }
    }

    await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
            ViewChannel: false
        }
    );

    await interaction.channel.setName(
        `closed-${interaction.channel.name.replace(
            "ticket-",
            ""
        )}`
    );

    await sendLog(
        interaction.guild,
        "Ticket Closed",
        `**Channel:** ${interaction.channel}\n**Closed by:** ${interaction.user.tag}`,
        0xFEE75C
    );

    return interaction.reply({
        content: "Ticket closed."
    });
}

/* =========================================================
   DELETE TICKET
========================================================= */

async function deleteTicket(interaction) {

    if (!interaction.channel.name.includes("ticket") &&
        !interaction.channel.name.includes("closed-")) {

        return interaction.reply({
            content: "This does not appear to be a ticket channel.",
            ephemeral: true
        });
    }

    if (
        !hasAdmin(interaction) &&
        !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )
    ) {

        return interaction.reply({
            content: "You need Manage Channels or Administrator to delete tickets.",
            ephemeral: true
        });
    }

    const channelName = interaction.channel.name;

    await sendLog(
        interaction.guild,
        "Ticket Deleted",
        `**Channel:** ${channelName}\n**Deleted by:** ${interaction.user.tag}`,
        0xED4245
    );

    await interaction.reply({
        content: "Deleting ticket..."
    });

    setTimeout(() => {
        interaction.channel.delete().catch(() => {});
    }, 1500);
}

/* =========================================================
   START APPLICATION
========================================================= */

async function startApplication(interaction, role) {

    if (!ROLE_TESTS[role]) {

        return interaction.reply({
            content: "That application type does not exist.",
            ephemeral: true
        });
    }

    const questions = ROLE_TESTS[role];

    const modal =
        new ModalBuilder()
            .setCustomId(
                `application_${role}_${interaction.user.id}`
            )
            .setTitle(
                `${role.charAt(0).toUpperCase() + role.slice(1)} Application`
            );

    /*
       Discord modals have a maximum of 5 text inputs.
       Therefore Part 1 asks questions 1-5.
       Part 2 will handle the remaining questions.
    */

    for (let i = 0; i < 5; i++) {

        const input =
            new TextInputBuilder()
                .setCustomId(`q${i + 1}`)
                .setLabel(
                    `${i + 1}. ${questions[i].slice(0, 45)}`
                )
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input)
        );
    }

    applications.set(interaction.user.id, {
        role,
        questions,
        answers: [],
        currentPage: 1
    });

    return interaction.showModal(modal);
}

/* =========================================================
   APPLICATION SUBMISSION
========================================================= */

async function submitApplication(interaction) {

    const parts =
        interaction.customId.split("_");

    const role = parts[1];

    const userId = parts[2];

    const application =
        applications.get(userId);

    if (!application) {

        return interaction.reply({
            content:
                "Your application session expired. Please start again.",
            ephemeral: true
        });
    }

    const answers = [];

    for (let i = 1; i <= 5; i++) {

        const answer =
            interaction.fields.getTextInputValue(
                `q${i}`
            );

        answers.push(answer);
    }

    application.answers.push(...answers);

    /*
       If questions 6-10 remain, show the second modal.
    */

    if (application.answers.length < 10) {

        const modal =
            new ModalBuilder()
                .setCustomId(
                    `application2_${role}_${userId}`
                )
                .setTitle(
                    `${role.charAt(0).toUpperCase() + role.slice(1)} Application 2/2`
                );

        for (let i = 5; i < 10; i++) {

            const input =
                new TextInputBuilder()
                    .setCustomId(`q${i + 1}`)
                    .setLabel(
                        `${i + 1}. ${application.questions[i].slice(0, 45)}`
                    )
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );
        }

        application.currentPage = 2;

        return interaction.showModal(modal);
    }

    /*
       Rate all 10 answers.
    */

    const scores =
        application.answers.map(rateAnswer);

    const total =
        scores.reduce(
            (sum, score) => sum + score,
            0
        );

    const average =
        Math.round(
            (total / scores.length) * 100
        ) / 100;

    const passed =
        average >= CONFIG.minimumPassingScore;

    /*
       Create application channel.
    */

    const category =
        await getOrCreateCategory(
            interaction.guild,
            CONFIG.applicationCategoryName
        );

    const supportRole =
        await getOrCreateRole(
            interaction.guild,
            CONFIG.supportRoleName
        );

    const channel =
        await interaction.guild.channels.create({
            name:
                `application-${safeChannelName(interaction.user.username)}`,
            type: ChannelType.GuildText,
            parent: category.id,

            permissionOverwrites: [
                {
                    id:
                        interaction.guild.roles.everyone.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel
                    ]
                },

                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },

                {
                    id: supportRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageMessages
                    ]
                }
            ]
        });

    const resultEmbed =
        new EmbedBuilder()
            .setTitle("Staff Application")
            .setDescription(
                `**Applicant:** ${interaction.user}\n` +
                `**Position:** ${role}\n` +
                `**Final Score:** ${average}/10\n` +
                `**Result:** ${passed ? "PASSED" : "FAILED"}`
            )
            .setColor(
                passed ? 0x57F287 : 0xED4245
            )
            .setTimestamp();

    await channel.send({
        content:
            `${interaction.user} <@&${supportRole.id}>`,
        embeds: [resultEmbed]
    });

    for (let i = 0; i < 10; i++) {

        const questionEmbed =
            new EmbedBuilder()
                .setTitle(
                    `Question ${i + 1}`
                )
                .setDescription(
                    `**Question:**\n${application.questions[i]}\n\n` +
                    `**Answer:**\n${application.answers[i]}\n\n` +
                    `**AI Score:** ${scores[i]}/10`
                )
                .setColor(0x5865F2);

        await channel.send({
            embeds: [questionEmbed]
        });
    }

    await sendLog(
        interaction.guild,
        "Application Submitted",
        `**Applicant:** ${interaction.user.tag}\n` +
        `**Position:** ${role}\n` +
        `**Score:** ${average}/10\n` +
        `**Result:** ${passed ? "PASSED" : "FAILED"}\n` +
        `**Application:** ${channel}`,
        passed ? 0x57F287 : 0xED4245
    );

    applications.delete(userId);

    return interaction.reply({
        content:
            `Your **${role}** application has been submitted.\n` +
            `Final score: **${average}/10**\n` +
            `Result: **${passed ? "PASSED" : "FAILED"}**\n\n` +
            `Your application has been sent to the support team.`,
        ephemeral: true
    });
}

/* =========================================================
   MESSAGE LOGGING
========================================================= */

client.on("messageDelete", async message => {

    if (!message.guild || message.author?.bot) {
        return;
    }

    await sendLog(
        message.guild,
        "Message Deleted",
        `**Author:** ${message.author?.tag || "Unknown"}\n` +
        `**Channel:** ${message.channel}\n` +
        `**Content:** ${message.content?.slice(0, 1000) || "Unavailable"}`,
        0xED4245
    );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {

    if (
        !oldMessage.guild ||
        oldMessage.author?.bot ||
        oldMessage.content === newMessage.content
    ) {
        return;
    }

    await sendLog(
        oldMessage.guild,
        "Message Edited",
        `**Author:** ${oldMessage.author?.tag || "Unknown"}\n` +
        `**Channel:** ${oldMessage.channel}\n\n` +
        `**Before:** ${oldMessage.content?.slice(0, 500) || "Unavailable"}\n` +
        `**After:** ${newMessage.content?.slice(0, 500) || "Unavailable"}`,
        0xFEE75C
    );
});

/* =========================================================
   MEMBER LOGGING
========================================================= */

client.on("guildMemberAdd", async member => {

    await sendLog(
        member.guild,
        "Member Joined",
        `**User:** ${member.user.tag}\n**ID:** ${member.id}`,
        0x57F287
    );
});

client.on("guildMemberRemove", async member => {

    await sendLog(
        member.guild,
        "Member Left",
        `**User:** ${member.user.tag}\n**ID:** ${member.id}`,
        0xED4245
    );
});

/* =========================================================
   ERROR HANDLERS
========================================================= */

process.on("unhandledRejection", error => {
    console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);

/* =========================================================
   PART 3 + 4
   SECURITY / ANTI-RAID / ANTI-SPAM / ANTI-LINK / ANTI-SLUR
   EXTRA MODERATION / CONFIG / SECURITY LOGGING
========================================================= */

/* =========================================================
   SECURITY CONFIG
========================================================= */

const SECURITY = {
    antiSpam: true,
    antiLinks: true,
    antiSlurs: true,
    antiRaid: true,
    antiNuke: true,

    spamMessageLimit: 6,
    spamTimeWindow: 5000,

    raidJoinLimit: 8,
    raidTimeWindow: 10000,

    punishment: "timeout",

    timeoutMinutes: 10,

    deleteBadMessages: true,

    logSecurityEvents: true
};

/* =========================================================
   RUNTIME SECURITY STORAGE
========================================================= */

const welcomeChannels = new Map();

const spamTracker = new Map();

const joinTracker = new Map();

const warningTracker = new Map();

const securityActions = new Collection();

/* =========================================================
   SLUR FILTER
   Keep this intentionally configurable.
========================================================= */

const BLOCKED_WORDS = [
    "nigger",
    "nigga",
    "faggot",
    "fag",
    "retard",
    "tranny",
    "dyke",
    "nka",
    "nca",
    "ncr",



];

/* =========================================================
   LINK FILTER
========================================================= */

const LINK_REGEX =
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

/* =========================================================
   SECURITY HELPERS
========================================================= */

function isSecurityAdmin(member) {

    if (!member) return false;

    return (
        member.id === OWNER_ID ||
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function containsBlockedWord(content) {

    const lower =
        content
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ");

    return BLOCKED_WORDS.some(word => {

        const regex =
            new RegExp(`(^|\\s)${word}(?=\\s|$)`, "i");

        return regex.test(lower);
    });
}

function containsLink(content) {
    return LINK_REGEX.test(content);
}

function addSecurityAction(guildId, userId) {

    const key =
        `${guildId}:${userId}`;

    const now = Date.now();

    const existing =
        securityActions.get(key) || [];

    existing.push(now);

    const filtered =
        existing.filter(
            timestamp =>
                now - timestamp < 60000
        );

    securityActions.set(
        key,
        filtered
    );
}

async function punishSecurityUser(
    member,
    reason
) {

    if (!member) return;

    if (
        member.id === OWNER_ID ||
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return;
    }

    try {

        if (
            SECURITY.punishment === "timeout" &&
            member.moderatable
        ) {

            await member.timeout(
                SECURITY.timeoutMinutes * 60 * 1000,
                reason
            );

            return;
        }

        if (
            SECURITY.punishment === "kick" &&
            member.kickable
        ) {

            await member.kick(reason);

            return;
        }

    } catch (error) {

        console.error(
            "Security punishment error:",
            error
        );
    }
}

/* =========================================================
   SECURITY LOG
========================================================= */

async function securityLog(
    guild,
    title,
    description,
    color = 0xED4245
) {

    if (!SECURITY.logSecurityEvents) {
        return;
    }

    await sendLog(
        guild,
        `Security | ${title}`,
        description,
        color
    );
}

/* =========================================================
   ANTI-SPAM
========================================================= */

client.on("messageCreate", async message => {

    if (!message.guild) return;

    if (message.author.bot) return;

    if (!SECURITY.antiSpam) return;

    const key =
        `${message.guild.id}:${message.author.id}`;

    const now =
        Date.now();

    let messages =
        spamTracker.get(key) || [];

    messages.push(now);

    messages =
        messages.filter(
            timestamp =>
                now - timestamp <=
                SECURITY.spamTimeWindow
        );

    spamTracker.set(
        key,
        messages
    );

    if (
        messages.length >=
        SECURITY.spamMessageLimit
    ) {

        spamTracker.delete(key);

        try {

            if (
                SECURITY.deleteBadMessages &&
                message.channel
                    .permissionsFor(
                        message.guild.members.me
                    )
                    ?.has(
                        PermissionsBitField.Flags.ManageMessages
                    )
            ) {

                await message.channel.bulkDelete(
                    Math.min(
                        messages.length,
                        10
                    ),
                    true
                );
            }

        } catch (error) {

            console.error(
                "Anti-spam delete error:",
                error
            );
        }

        const member =
            message.member;

        await punishSecurityUser(
            member,
            "Automatic anti-spam protection"
        );

        await securityLog(
            message.guild,
            "Spam Detected",
            `**User:** ${message.author.tag}\n` +
            `**Channel:** ${message.channel}\n` +
            `**Action:** Automatic protection`,
            0xED4245
        );
    }
});

client.on("guildMemberAdd", async member => {

    /* =========================
       WELCOME MESSAGE
    ========================= */

    const channelId =
        welcomeChannels.get(member.guild.id);

    if (channelId) {

        const channel =
            member.guild.channels.cache.get(
                channelId
            );

        if (channel) {

            const embed =
                new EmbedBuilder()
                    .setTitle("Welcome!")
                    .setDescription(
                        `Welcome ${member} to **${member.guild.name}**!\n\n` +
                        `You are member **#${member.guild.memberCount}**.`
                    )
                    .setThumbnail(
                        member.user.displayAvatarURL({
                            size: 1024
                        })
                    )
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({
                        text: "LegacyUnlock"
                    });

            await channel.send({
                content: `${member}`,
                embeds: [embed]
            });
        }
    }

    /* =========================
       JOIN LOG
    ========================= */

    await sendLog(
        member.guild,
        "Member Joined",
        `**User:** ${member.user.tag}\n` +
        `**ID:** ${member.id}`,
        0x57F287
    );

    /* =========================
       ANTI-RAID
    ========================= */

    if (!SECURITY.antiRaid) {
        return;
    }

    const guildId =
        member.guild.id;

    const now =
        Date.now();

    let joins =
        joinTracker.get(guildId) || [];

    joins.push(now);

    joins =
        joins.filter(
            timestamp =>
                now - timestamp <=
                SECURITY.raidTimeWindow
        );

    joinTracker.set(
        guildId,
        joins
    );

    if (
        joins.length >=
        SECURITY.raidJoinLimit
    ) {

        await securityLog(
            member.guild,
            "Possible Raid Detected",
            `**Recent joins:** ${joins.length}\n` +
            `**Time window:** ${SECURITY.raidTimeWindow / 1000}s\n` +
            `Automatic raid protection has been activated.`,
            0xED4245
        );
    }
});

/* =========================================================
   ANTI-LINK
========================================================= */

client.on("messageCreate", async message => {

    if (!message.guild) return;

    if (message.author.bot) return;

    if (!SECURITY.antiLinks) return;

    /*
       Allow administrators and owner to post links.
    */

    if (
        message.author.id === OWNER_ID ||
        message.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
        )
    ) {
        return;
    }

    if (!containsLink(message.content)) {
        return;
    }

    try {

        if (
            SECURITY.deleteBadMessages &&
            message.deletable
        ) {

            await message.delete();
        }

    } catch (error) {

        console.error(
            "Anti-link error:",
            error
        );
    }

    await securityLog(
        message.guild,
        "Blocked Link",
        `**User:** ${message.author.tag}\n` +
        `**Channel:** ${message.channel}\n` +
        `**Action:** Message removed`,
        0xFEE75C
    );
});

/* =========================================================
   ANTI-SLUR
========================================================= */

client.on("messageCreate", async message => {

    if (!message.guild) return;

    if (message.author.bot) return;

    if (!SECURITY.antiSlurs) return;

    if (
        message.author.id === OWNER_ID ||
        message.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
        )
    ) {
        return;
    }

    if (!containsBlockedWord(message.content)) {
        return;
    }

    try {

        if (
            SECURITY.deleteBadMessages &&
            message.deletable
        ) {

            await message.delete();
        }

    } catch (error) {

        console.error(
            "Anti-slur error:",
            error
        );
    }

    await punishSecurityUser(
        message.member,
        "Automatic anti-slur protection"
    );

    await securityLog(
        message.guild,
        "Blocked Slur",
        `**User:** ${message.author.tag}\n` +
        `**Channel:** ${message.channel}\n` +
        `**Action:** Message removed and user punished`,
        0xED4245
    );
});

/* =========================================================
   ANTI-RAID
========================================================= */

client.on("guildMemberAdd", async member => {

    if (!SECURITY.antiRaid) return;

    const guildId =
        member.guild.id;

    const now =
        Date.now();

    let joins =
        joinTracker.get(guildId) || [];

    joins.push(now);

    joins =
        joins.filter(
            timestamp =>
                now - timestamp <=
                SECURITY.raidTimeWindow
        );

    joinTracker.set(
        guildId,
        joins
    );

    if (
        joins.length >=
        SECURITY.raidJoinLimit
    ) {

        await securityLog(
            member.guild,
            "Possible Raid Detected",
            `**Recent joins:** ${joins.length}\n` +
            `**Time window:** ${SECURITY.raidTimeWindow / 1000}s\n` +
            `Automatic raid protection has been activated.`,
            0xED4245
        );

        /*
           Temporarily lock the guild's default channel
           where possible.
        */

        try {

            const channels =
                member.guild.channels.cache.filter(
                    channel =>
                        channel.type ===
                        ChannelType.GuildText
                );

            for (
                const channel of channels.values()
            ) {

                const permissions =
                    channel.permissionsFor(
                        member.guild.roles.everyone
                    );

                if (
                    permissions &&
                    permissions.has(
                        PermissionsBitField.Flags.ViewChannel
                    )
                ) {

                    await channel.permissionOverwrites.edit(
                        member.guild.roles.everyone,
                        {
                            SendMessages: false
                        },
                        {
                            reason:
                                "Automatic anti-raid protection"
                        }
                    );
                }
            }

        } catch (error) {

            console.error(
                "Raid lock error:",
                error
            );
        }

        /*
           Reset after 60 seconds.
        */

        setTimeout(
            async () => {

                try {

                    const channels =
                        member.guild.channels.cache.filter(
                            channel =>
                                channel.type ===
                                ChannelType.GuildText
                        );

                    for (
                        const channel of channels.values()
                    ) {

                        await channel.permissionOverwrites.edit(
                            member.guild.roles.everyone,
                            {
                                SendMessages: null
                            },
                            {
                                reason:
                                    "Automatic anti-raid unlock"
                            }
                        );
                    }

                    joinTracker.delete(
                        guildId
                    );

                    await securityLog(
                        member.guild,
                        "Raid Lock Released",
                        "Automatic raid protection has been released.",
                        0x57F287
                    );

                } catch (error) {

                    console.error(
                        "Raid unlock error:",
                        error
                    );
                }

            },
            60000
        );
    }
});

/* =========================================================
   ANTI-NUKE
========================================================= */

const destructiveAuditActions = [
    "ChannelDelete",
    "RoleDelete",
    "GuildBanAdd",
    "ChannelCreate",
    "RoleCreate"
];

const auditTracker = new Map();

async function processAuditSecurity(
    guild,
    executorId,
    action
) {

    if (!SECURITY.antiNuke) return;

    if (executorId === client.user.id) {
        return;
    }

    if (executorId === OWNER_ID) {
        return;
    }

    const key =
        `${guild.id}:${executorId}`;

    const now =
        Date.now();

    let actions =
        auditTracker.get(key) || [];

    actions.push({
        action,
        timestamp: now
    });

    actions =
        actions.filter(
            entry =>
                now - entry.timestamp <
                30000
        );

    auditTracker.set(
        key,
        actions
    );

    if (actions.length < 3) {
        return;
    }

    let member =
        guild.members.cache.get(
            executorId
        );

    if (!member) {

        member =
            await guild.members
                .fetch(executorId)
                .catch(() => null);
    }

    if (!member) return;

    /*
       Remove dangerous permissions from the suspected
       account instead of automatically banning them.
    */

    try {

        const dangerousRoles =
            member.roles.cache.filter(
                role =>
                    role.editable &&
                    role.permissions.has(
                        PermissionsBitField.Flags.Administrator
                    )
            );

        for (
            const role of dangerousRoles.values()
        ) {

            await member.roles.remove(
                role,
                "Automatic anti-nuke protection"
            );
        }

        await securityLog(
            guild,
            "Anti-Nuke Triggered",
            `**User:** ${member.user.tag}\n` +
            `**Actions:** ${actions.length}\n` +
            `**Action:** Dangerous permissions removed`,
            0xED4245
        );

    } catch (error) {

        console.error(
            "Anti-nuke response error:",
            error
        );
    }

    auditTracker.delete(key);
}

/* =========================================================
   AUDIT LOG LISTENERS
========================================================= */

client.on("channelDelete", async channel => {

    if (!channel.guild) return;

    try {

        const logs =
            await channel.guild.fetchAuditLogs({
                type: 12,
                limit: 1
            });

        const entry =
            logs.entries.first();

        if (!entry) return;

        if (
            Date.now() -
            entry.createdTimestamp >
            10000
        ) {
            return;
        }

        await processAuditSecurity(
            channel.guild,
            entry.executor.id,
            "ChannelDelete"
        );

        await securityLog(
            channel.guild,
            "Channel Deleted",
            `**Channel:** ${channel.name}\n` +
            `**Executor:** ${entry.executor.tag}`,
            0xED4245
        );

    } catch (error) {

        console.error(
            "Channel delete audit error:",
            error
        );
    }
});

client.on("roleDelete", async role => {

    if (!role.guild) return;

    try {

        const logs =
            await role.guild.fetchAuditLogs({
                type: 32,
                limit: 1
            });

        const entry =
            logs.entries.first();

        if (!entry) return;

        if (
            Date.now() -
            entry.createdTimestamp >
            10000
        ) {
            return;
        }

        await processAuditSecurity(
            role.guild,
            entry.executor.id,
            "RoleDelete"
        );

        await securityLog(
            role.guild,
            "Role Deleted",
            `**Role:** ${role.name}\n` +
            `**Executor:** ${entry.executor.tag}`,
            0xED4245
        );

    } catch (error) {

        console.error(
            "Role delete audit error:",
            error
        );
    }
});

/* =========================================================
   CHANNEL CREATE LOGGING
========================================================= */

client.on("channelCreate", async channel => {

    if (!channel.guild) return;

    await securityLog(
        channel.guild,
        "Channel Created",
        `**Channel:** ${channel.name}\n` +
        `**Type:** ${channel.type}`,
        0x57F287
    );
});

/* =========================================================
   ROLE CREATE LOGGING
========================================================= */

client.on("roleCreate", async role => {

    if (!role.guild) return;

    await securityLog(
        role.guild,
        "Role Created",
        `**Role:** ${role.name}\n` +
        `**ID:** ${role.id}`,
        0x57F287
    );
});

/* =========================================================
   MEMBER BAN LOGGING
========================================================= */

client.on("guildBanAdd", async ban => {

    await securityLog(
        ban.guild,
        "Member Banned",
        `**User:** ${ban.user.tag}\n` +
        `**ID:** ${ban.user.id}`,
        0xED4245
    );

    try {

        const logs =
            await ban.guild.fetchAuditLogs({
                type: 22,
                limit: 1
            });

        const entry =
            logs.entries.first();

        if (!entry) return;

        if (
            Date.now() -
            entry.createdTimestamp >
            10000
        ) {
            return;
        }

        await processAuditSecurity(
            ban.guild,
            entry.executor.id,
            "GuildBanAdd"
        );

    } catch (error) {

        console.error(
            "Ban audit error:",
            error
        );
    }
});

/* =========================================================
   CONFIGURATION COMMANDS
========================================================= */

commands.push(

    new SlashCommandBuilder()
        .setName("security")
        .setDescription("View security status"),

    new SlashCommandBuilder()
        .setName("antispam")
        .setDescription("Enable or disable anti-spam")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable anti-spam")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("antilink")
        .setDescription("Enable or disable anti-link")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable anti-link")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("antislur")
        .setDescription("Enable or disable anti-slur")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable anti-slur")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("antiraid")
        .setDescription("Enable or disable anti-raid")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable anti-raid")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("antinuke")
        .setDescription("Enable or disable anti-nuke")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable anti-nuke")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("setpunishment")
        .setDescription("Set automatic security punishment")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Punishment type")
                .setRequired(true)
                .addChoices(
                    {
                        name: "Timeout",
                        value: "timeout"
                    },
                    {
                        name: "Kick",
                        value: "kick"
                    }
                )
        ),

    new SlashCommandBuilder()
        .setName("securitytest")
        .setDescription("Test the security system")
);

/* =========================================================
   IMPORTANT:
   GLOBAL COMMAND REGISTRATION REPLACEMENT
========================================================= */

async function registerAllCommands() {

    try {

        const rest =
            new REST({
                version: "10"
            }).setToken(TOKEN);

        const commandData =
            commands.map(
                command =>
                    command.toJSON()
            );

        console.log(
            `Registering ${commandData.length} global commands...`
        );

        await rest.put(
            Routes.applicationCommands(
                CLIENT_ID
            ),
            {
                body: commandData
            }
        );

        console.log(
            `Registered ${commandData.length} global commands.`
        );

    } catch (error) {

        console.error(
            "Global registration error:",
            error
        );
    }
}

/* =========================================================
   SECURITY COMMAND HANDLER
========================================================= */

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command =
        interaction.commandName;

    if (
        ![
            "security",
            "antispam",
            "antilink",
            "antislur",
            "antiraid",
            "antinuke",
            "setpunishment",
            "securitytest"
        ].includes(command)
    ) {
        return;
    }

    if (!hasAdmin(interaction)) {

        return interaction.reply({
            content:
                "You need Administrator permission to use this command.",
            ephemeral: true
        });
    }

    /* =========================
       SECURITY STATUS
    ========================= */

    if (command === "security") {

        const embed =
            new EmbedBuilder()
                .setTitle("Security System")
                .addFields(
                    {
                        name: "Anti-Spam",
                        value:
                            SECURITY.antiSpam
                                ? "Enabled"
                                : "Disabled",
                        inline: true
                    },
                    {
                        name: "Anti-Link",
                        value:
                            SECURITY.antiLinks
                                ? "Enabled"
                                : "Disabled",
                        inline: true
                    },
                    {
                        name: "Anti-Slur",
                        value:
                            SECURITY.antiSlurs
                                ? "Enabled"
                                : "Disabled",
                        inline: true
                    },
                    {
                        name: "Anti-Raid",
                        value:
                            SECURITY.antiRaid
                                ? "Enabled"
                                : "Disabled",
                        inline: true
                    },
                    {
                        name: "Anti-Nuke",
                        value:
                            SECURITY.antiNuke
                                ? "Enabled"
                                : "Disabled",
                        inline: true
                    },
                    {
                        name: "Punishment",
                        value:
                            SECURITY.punishment,
                        inline: true
                    }
                )
                .setColor(0x5865F2);

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    /* =========================
       ANTI-SPAM
    ========================= */

    if (command === "antispam") {

        SECURITY.antiSpam =
            interaction.options.getBoolean(
                "enabled"
            );

        return interaction.reply({
            content:
                `Anti-spam is now **${
                    SECURITY.antiSpam
                        ? "enabled"
                        : "disabled"
                }**.`,
            ephemeral: true
        });
    }

    /* =========================
       ANTI-LINK
    ========================= */

    if (command === "antilink") {

        SECURITY.antiLinks =
            interaction.options.getBoolean(
                "enabled"
            );

        return interaction.reply({
            content:
                `Anti-link is now **${
                    SECURITY.antiLinks
                        ? "enabled"
                        : "disabled"
                }**.`,
            ephemeral: true
        });
    }

    /* =========================
       ANTI-SLUR
    ========================= */

    if (command === "antislur") {

        SECURITY.antiSlurs =
            interaction.options.getBoolean(
                "enabled"
            );

        return interaction.reply({
            content:
                `Anti-slur is now **${
                    SECURITY.antiSlurs
                        ? "enabled"
                        : "disabled"
                }**.`,
            ephemeral: true
        });
    }

    /* =========================
       ANTI-RAID
    ========================= */

    if (command === "antiraid") {

        SECURITY.antiRaid =
            interaction.options.getBoolean(
                "enabled"
            );

        return interaction.reply({
            content:
                `Anti-raid is now **${
                    SECURITY.antiRaid
                        ? "enabled"
                        : "disabled"
                }**.`,
            ephemeral: true
        });
    }

    /* =========================
       ANTI-NUKE
    ========================= */

    if (command === "antinuke") {

        SECURITY.antiNuke =
            interaction.options.getBoolean(
                "enabled"
            );

        return interaction.reply({
            content:
                `Anti-nuke is now **${
                    SECURITY.antiNuke
                        ? "enabled"
                        : "disabled"
                }**.`,
            ephemeral: true
        });
    }

    /* =========================
       PUNISHMENT
    ========================= */

    if (command === "setpunishment") {

        SECURITY.punishment =
            interaction.options.getString(
                "type"
            );

        return interaction.reply({
            content:
                `Automatic security punishment set to **${SECURITY.punishment}**.`,
            ephemeral: true
        });
    }

    /* =========================
       SECURITY TEST
    ========================= */

    if (command === "securitytest") {

        await securityLog(
            interaction.guild,
            "Security Test",
            `Security test executed by **${interaction.user.tag}**.`,
            0x57F287
        );

        return interaction.reply({
            content:
                "Security logging test completed. Check the bot-logs channel.",
            ephemeral: true
        });
    }
});

/* =========================================================
   STARTUP OVERRIDE
========================================================= */

client.once("ready", async () => {

    await registerAllCommands();

    console.log(
        "Security systems initialized."
    );

    console.log(
        "Anti-spam:",
        SECURITY.antiSpam
    );

    console.log(
        "Anti-link:",
        SECURITY.antiLinks
    );

    console.log(
        "Anti-slur:",
        SECURITY.antiSlurs
    );

    console.log(
        "Anti-raid:",
        SECURITY.antiRaid
    );

    console.log(
        "Anti-nuke:",
        SECURITY.antiNuke
    );
});