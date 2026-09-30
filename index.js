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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
    console.error("Missing DISCORD_TOKEN, CLIENT_ID, or OWNER_ID.");
    console.error("Required environment variables:");
    console.error("DISCORD_TOKEN");
    console.error("CLIENT_ID");
    console.error("OWNER_ID");
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

const applications = new Map();
const welcomeChannels = new Map();
const spamTracker = new Map();
const joinTracker = new Map();
const ticketOwners = new Map();
const ticketClaims = new Map();
const warnings = new Map();
const securityActions = new Collection();

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
    "ncr"
];

const LINK_REGEX =
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

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

function isOwner(interaction) {
    return interaction.user.id === OWNER_ID;
}

function hasAdmin(interaction) {
    return (
        isOwner(interaction) ||
        interaction.member?.permissions?.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function hasModeration(interaction) {
    return (
        isOwner(interaction) ||
        interaction.member?.permissions?.has(
            PermissionsBitField.Flags.ModerateMembers
        )
    );
}

function isStaff(member) {
    if (!member) return false;

    if (
        member.id === OWNER_ID ||
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
        return true;
    }

    return member.roles.cache.some(role =>
        [
            CONFIG.supportRoleName,
            CONFIG.adminRoleName,
            CONFIG.moderatorRoleName
        ].includes(role.name)
    );
}

async function getOrCreateRole(guild, name, color) {
    let role = guild.roles.cache.find(
        r => r.name.toLowerCase() === name.toLowerCase()
    );

    if (!role) {
        role = await guild.roles.create({
            name,
            color: color || undefined,
            reason: "LegacyUnlock automatic setup"
        });
    }

    return role;
}

async function getOrCreateCategory(guild, name) {
    let category = guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildCategory &&
            channel.name.toLowerCase() === name.toLowerCase()
    );

    if (!category) {
        category = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            reason: "LegacyUnlock automatic setup"
        });
    }

    return category;
}

async function getOrCreateLogChannel(guild) {
    let channel = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildText &&
            c.name.toLowerCase() === CONFIG.logChannelName.toLowerCase()
    );

    if (!channel) {
        channel = await guild.channels.create({
            name: CONFIG.logChannelName,
            type: ChannelType.GuildText,
            reason: "LegacyUnlock logging setup"
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

function safeChannelName(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

function rateAnswer(answer) {
    if (!answer || !answer.trim()) {
        return 1;
    }

    const value = answer.trim();

    let score = 1;

    if (value.length >= 20) score += 1;
    if (value.length >= 50) score += 1;
    if (value.length >= 100) score += 1;

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
        if (value.toLowerCase().includes(word)) {
            score += 0.25;
        }
    }

    return Math.min(10, Math.round(score * 4) / 4);
}

function containsBlockedWord(content) {
    const lower = content
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ");

    return BLOCKED_WORDS.some(word => {
        const regex = new RegExp(`(^|\\s)${word}(?=\\s|$)`, "i");
        return regex.test(lower);
    });
}

function containsLink(content) {
    return LINK_REGEX.test(content);
}

async function punishSecurityUser(member, reason) {
    if (!member) return;

    if (
        member.id === OWNER_ID ||
        member.permissions.has(PermissionsBitField.Flags.Administrator)
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
        }
    } catch (error) {
        console.error("Security punishment error:", error);
    }
}

async function securityLog(guild, title, description) {
    if (!SECURITY.logSecurityEvents) return;

    await sendLog(
        guild,
        `Security | ${title}`,
        description,
        0xED4245
    );
}

function commandError(interaction, message) {
    const payload = {
        content: `❌ ${message}`,
        ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => {});
    }

    return interaction.reply(payload).catch(() => {});
}

const commands = [
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

    new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Start a staff application"),

    new SlashCommandBuilder()
        .setName("applicationpanel")
        .setDescription("Create the application panel"),

    new SlashCommandBuilder()
        .setName("applications")
        .setDescription("View application system information"),

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
        .setDescription("Set up the application system"),

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
                    { name: "Timeout", value: "timeout" },
                    { name: "Kick", value: "kick" }
                )
        ),

    new SlashCommandBuilder()
        .setName("securitytest")
        .setDescription("Test the security system")
];

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    const commandData = commands.map(command => command.toJSON());

    console.log(`Registering ${commandData.length} global slash commands...`);

    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        {
            body: commandData
        }
    );

    console.log("Global slash commands registered.");

    for (const guild of client.guilds.cache.values()) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    guild.id
                ),
                {
                    body: []
                }
            );

            console.log(
                `Cleared old server commands from ${guild.name}`
            );
        } catch (error) {
            console.error(
                `Could not clear old commands from ${guild.name}:`,
                error.message
            );
        }
    }
}

async function createTicket(interaction) {
    const guild = interaction.guild;

    if (!guild) {
        return commandError(interaction, "This command can only be used in a server.");
    }

    const existing = guild.channels.cache.find(
        channel =>
            channel.topic === `LegacyUnlock ticket for ${interaction.user.id}`
    );

    if (existing) {
        return interaction.reply({
            content: `You already have a ticket: ${existing}`,
            ephemeral: true
        });
    }

    const category = await getOrCreateCategory(
        guild,
        CONFIG.ticketCategoryName
    );

    const supportRole = await getOrCreateRole(
        guild,
        CONFIG.supportRoleName
    );

    const channelName = `ticket-${safeChannelName(interaction.user.username)}`;

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `LegacyUnlock ticket for ${interaction.user.id}`,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
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
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ]
    });

    ticketOwners.set(channel.id, interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle("LegacyUnlock Ticket")
        .setDescription(
            `Welcome ${interaction.user}.\n\n` +
            "Please explain what you need help with. A member of the support team will assist you."
        )
        .setColor(0x5865F2)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_claim")
            .setLabel("Claim")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Close")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("ticket_delete")
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `${interaction.user} <@&${supportRole.id}>`,
        embeds: [embed],
        components: [row]
    });

    await interaction.reply({
        content: `Your ticket has been created: ${channel}`,
        ephemeral: true
    });

    await sendLog(
        guild,
        "Ticket Created",
        `${interaction.user} created ${channel}.`
    );
}

async function closeTicket(interaction) {
    if (!interaction.channel) {
        return commandError(interaction, "This is not a ticket channel.");
    }

    const ownerId = ticketOwners.get(interaction.channel.id);

    if (
        !ownerId &&
        !interaction.channel.name.startsWith("ticket-")
    ) {
        return commandError(interaction, "This is not a ticket channel.");
    }

    if (
        interaction.user.id !== ownerId &&
        !isStaff(interaction.member)
    ) {
        return commandError(interaction, "You cannot close this ticket.");
    }

    await interaction.channel.permissionOverwrites.edit(
        ownerId,
        {
            SendMessages: false
        }
    ).catch(() => {});

    await interaction.reply(
        "🔒 This ticket has been closed."
    );

    await sendLog(
        interaction.guild,
        "Ticket Closed",
        `${interaction.user} closed ${interaction.channel}.`
    );
}

async function deleteTicket(interaction) {
    if (!interaction.channel) {
        return commandError(interaction, "This is not a ticket channel.");
    }

    const ownerId = ticketOwners.get(interaction.channel.id);

    if (
        interaction.user.id !== ownerId &&
        !isStaff(interaction.member)
    ) {
        return commandError(interaction, "You cannot delete this ticket.");
    }

    await interaction.reply("🗑️ Deleting this ticket...");

    await sendLog(
        interaction.guild,
        "Ticket Deleted",
        `${interaction.user} deleted #${interaction.channel.name}.`
    );

    setTimeout(() => {
        interaction.channel.delete().catch(() => {});
    }, 1000);
}

async function claimTicket(interaction) {
    if (!interaction.channel) {
        return commandError(interaction, "This is not a ticket channel.");
    }

    if (!isStaff(interaction.member)) {
        return commandError(interaction, "Only staff can claim tickets.");
    }

    ticketClaims.set(
        interaction.channel.id,
        interaction.user.id
    );

    await interaction.reply(
        `📌 ${interaction.user} has claimed this ticket.`
    );

    await sendLog(
        interaction.guild,
        "Ticket Claimed",
        `${interaction.user} claimed #${interaction.channel.name}.`
    );
}

async function startApplication(interaction, roleName) {
    const questions = ROLE_TESTS[roleName];

    if (!questions) {
        return commandError(interaction, "Invalid application type.");
    }

    const key = `${interaction.guild.id}:${interaction.user.id}`;

    if (applications.has(key)) {
        return commandError(
            interaction,
            "You already have an active application."
        );
    }

    applications.set(key, {
        role: roleName,
        index: 0,
        answers: [],
        questions
    });

    const firstQuestion = questions[0];

    const modal = new ModalBuilder()
        .setCustomId(`application_answer_${roleName}_0`)
        .setTitle(`Application: ${roleName}`);

    const input = new TextInputBuilder()
        .setCustomId("answer")
        .setLabel(firstQuestion.slice(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder("Enter your answer...");

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

async function finishApplication(interaction, data) {
    const scores = data.answers.map(rateAnswer);
    const total = scores.reduce((a, b) => a + b, 0);
    const average = Math.round(
        (total / scores.length) * 100
    ) / 100;

    const passed =
        average >= CONFIG.minimumPassingScore;

    const role = await getOrCreateRole(
        interaction.guild,
        data.role
    );

    if (passed) {
        const member = await interaction.guild.members.fetch(
            interaction.user.id
        ).catch(() => null);

        if (member) {
            await member.roles.add(
                role,
                "LegacyUnlock application passed"
            ).catch(() => {});
        }
    }

    applications.delete(
        `${interaction.guild.id}:${interaction.user.id}`
    );

    const embed = new EmbedBuilder()
        .setTitle("Application Complete")
        .setColor(passed ? 0x57F287 : 0xED4245)
        .setDescription(
            `**Role:** ${data.role}\n` +
            `**Score:** ${average}/10\n` +
            `**Required:** ${CONFIG.minimumPassingScore}/10\n\n` +
            (
                passed
                    ? `✅ You passed and received the **${role.name}** role.`
                    : "❌ You did not reach the required score."
            )
        )
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });

    await sendLog(
        interaction.guild,
        "Application Completed",
        `${interaction.user} applied for ${data.role} and scored ${average}/10.`
    );
}

async function handleApplicationModal(interaction) {
    const parts = interaction.customId.split("_");

    const roleName = parts[2];
    const index = Number(parts[3]);

    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const data = applications.get(key);

    if (!data) {
        return interaction.reply({
            content: "This application has expired. Please start again.",
            ephemeral: true
        });
    }

    const answer = interaction.fields.getTextInputValue("answer");

    data.answers.push(answer);

    const nextIndex = index + 1;

    if (nextIndex >= data.questions.length) {
        return finishApplication(interaction, data);
    }

    data.index = nextIndex;

    const modal = new ModalBuilder()
        .setCustomId(
            `application_answer_${roleName}_${nextIndex}`
        )
        .setTitle(
            `Application ${nextIndex + 1}/${data.questions.length}`
        );

    const input = new TextInputBuilder()
        .setCustomId("answer")
        .setLabel(
            data.questions[nextIndex].slice(0, 45)
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder("Enter your answer...");

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

async function createApplicationPanel(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("LegacyUnlock Applications")
        .setDescription(
            "Select the position you want to apply for below."
        )
        .setColor(0x5865F2);

    const menu = new StringSelectMenuBuilder()
        .setCustomId("application_select")
        .setPlaceholder("Choose an application")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Tester")
                .setDescription("Apply for Tester")
                .setValue("tester"),
            new StringSelectMenuOptionBuilder()
                .setLabel("Moderator")
                .setDescription("Apply for Moderator")
                .setValue("moderator"),
            new StringSelectMenuOptionBuilder()
                .setLabel("Support")
                .setDescription("Apply for Support")
                .setValue("support"),
            new StringSelectMenuOptionBuilder()
                .setLabel("Developer")
                .setDescription("Apply for Developer")
                .setValue("developer")
        );

    await interaction.channel.send({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu)
        ]
    });

    await interaction.reply({
        content: "Application panel created.",
        ephemeral: true
    });
}

async function setupServer(interaction) {
    await getOrCreateRole(
        interaction.guild,
        CONFIG.supportRoleName
    );

    await getOrCreateRole(
        interaction.guild,
        CONFIG.adminRoleName
    );

    await getOrCreateRole(
        interaction.guild,
        CONFIG.moderatorRoleName
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

    await interaction.reply({
        content:
            "✅ LegacyUnlock setup has been completed.\n\n" +
            "Created/verified:\n" +
            `• ${CONFIG.supportRoleName}\n` +
            `• ${CONFIG.adminRoleName}\n` +
            `• ${CONFIG.moderatorRoleName}\n` +
            `• ${CONFIG.ticketCategoryName}\n` +
            `• ${CONFIG.applicationCategoryName}\n` +
            `• ${CONFIG.logChannelName}`,
        ephemeral: true
    });
}

async function handleCommand(interaction) {
    const name = interaction.commandName;

    if (!interaction.guild && name !== "ping" && name !== "botinfo") {
        return commandError(
            interaction,
            "This command must be used inside a server."
        );
    }

    if (name === "ping") {
        return interaction.reply(
            `🏓 Pong! WebSocket latency: ${client.ws.ping}ms`
        );
    }

    if (name === "botinfo") {
        const embed = new EmbedBuilder()
            .setTitle(CONFIG.botName)
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "Servers",
                    value: String(client.guilds.cache.size),
                    inline: true
                },
                {
                    name: "Users",
                    value: String(
                        client.guilds.cache.reduce(
                            (total, guild) =>
                                total + (guild.memberCount || 0),
                            0
                        )
                    ),
                    inline: true
                },
                {
                    name: "Commands",
                    value: String(commands.length),
                    inline: true
                }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "setwelcome") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        const channel = interaction.options.getChannel("channel");

        welcomeChannels.set(
            interaction.guild.id,
            channel.id
        );

        await interaction.reply({
            content: `Welcome messages will now be sent in ${channel}.`,
            ephemeral: true
        });

        return sendLog(
            interaction.guild,
            "Welcome Channel Updated",
            `${interaction.user} set the welcome channel to ${channel}.`
        );
    }

    if (name === "serverinfo") {
        const guild = interaction.guild;

        const embed = new EmbedBuilder()
            .setTitle(guild.name)
            .setColor(0x5865F2)
            .setThumbnail(guild.iconURL({ size: 512 }))
            .addFields(
                {
                    name: "Owner",
                    value: `<@${guild.ownerId}>`,
                    inline: true
                },
                {
                    name: "Members",
                    value: String(guild.memberCount),
                    inline: true
                },
                {
                    name: "Channels",
                    value: String(guild.channels.cache.size),
                    inline: true
                },
                {
                    name: "Roles",
                    value: String(guild.roles.cache.size),
                    inline: true
                },
                {
                    name: "Created",
                    value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
                    inline: false
                }
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "userinfo") {
        const user =
            interaction.options.getUser("user") ||
            interaction.user;

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        const embed = new EmbedBuilder()
            .setTitle(user.username)
            .setThumbnail(user.displayAvatarURL({ size: 512 }))
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "User ID",
                    value: user.id,
                    inline: true
                },
                {
                    name: "Bot",
                    value: user.bot ? "Yes" : "No",
                    inline: true
                },
                {
                    name: "Joined Server",
                    value: member?.joinedTimestamp
                        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                        : "Unknown",
                    inline: false
                }
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "avatar") {
        const user =
            interaction.options.getUser("user") ||
            interaction.user;

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Avatar`)
            .setImage(user.displayAvatarURL({ size: 1024 }))
            .setColor(0x5865F2);

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "help") {
        const embed = new EmbedBuilder()
            .setTitle("LegacyUnlock Commands")
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "General",
                    value:
                        "`/ping` `/botinfo` `/serverinfo` `/userinfo` `/avatar` `/help` `/setwelcome`"
                },
                {
                    name: "Moderation",
                    value:
                        "`/kick` `/ban` `/unban` `/timeout` `/warn` `/clear`"
                },
                {
                    name: "Tickets",
                    value:
                        "`/ticketpanel` `/ticket` `/ticketclose` `/ticketdelete` `/ticketclaim`"
                },
                {
                    name: "Applications",
                    value:
                        "`/apply` `/applicationpanel` `/applications`"
                },
                {
                    name: "Setup",
                    value:
                        "`/setup` `/setlogs` `/setuptickets` `/setupapplications`"
                },
                {
                    name: "Security",
                    value:
                        "`/security` `/antispam` `/antilink` `/antislur` `/antiraid` `/antinuke` `/setpunishment` `/securitytest`"
                }
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "kick") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const user = interaction.options.getUser("user");
        const reason =
            interaction.options.getString("reason") ||
            "No reason provided.";

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {
            return commandError(interaction, "That member is not in this server.");
        }

        if (!member.kickable) {
            return commandError(interaction, "I cannot kick that member.");
        }

        await member.kick(reason);

        await interaction.reply(
            `👢 ${user.tag} was kicked.\nReason: ${reason}`
        );

        return sendLog(
            interaction.guild,
            "Member Kicked",
            `${interaction.user} kicked ${user}.\nReason: ${reason}`
        );
    }

    if (name === "ban") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const user = interaction.options.getUser("user");
        const reason =
            interaction.options.getString("reason") ||
            "No reason provided.";

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (member && !member.bannable) {
            return commandError(interaction, "I cannot ban that member.");
        }

        await interaction.guild.members.ban(
            user.id,
            { reason }
        );

        await interaction.reply(
            `🔨 ${user.tag} was banned.\nReason: ${reason}`
        );

        return sendLog(
            interaction.guild,
            "Member Banned",
            `${interaction.user} banned ${user}.\nReason: ${reason}`
        );
    }

    if (name === "unban") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const userId =
            interaction.options.getString("userid");

        try {
            const ban =
                await interaction.guild.bans.fetch(userId);

            await interaction.guild.members.unban(
                userId,
                `Unbanned by ${interaction.user.tag}`
            );

            return interaction.reply(
                `✅ ${ban.user.tag} has been unbanned.`
            );
        } catch {
            return commandError(
                interaction,
                "That user is not banned or the ID is invalid."
            );
        }
    }

    if (name === "timeout") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const user = interaction.options.getUser("user");
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
            return commandError(interaction, "That member is not in this server.");
        }

        if (!member.moderatable) {
            return commandError(interaction, "I cannot timeout that member.");
        }

        await member.timeout(
            minutes * 60 * 1000,
            reason
        );

        await interaction.reply(
            `⏱️ ${user.tag} was timed out for ${minutes} minute(s).\nReason: ${reason}`
        );

        return sendLog(
            interaction.guild,
            "Member Timed Out",
            `${interaction.user} timed out ${user} for ${minutes} minute(s).\nReason: ${reason}`
        );
    }

    if (name === "warn") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const user = interaction.options.getUser("user");
        const reason =
            interaction.options.getString("reason");

        const key =
            `${interaction.guild.id}:${user.id}`;

        const list =
            warnings.get(key) || [];

        list.push({
            reason,
            moderator: interaction.user.id,
            timestamp: Date.now()
        });

        warnings.set(key, list);

        await interaction.reply(
            `⚠️ ${user.tag} has been warned.\nReason: ${reason}`
        );

        return sendLog(
            interaction.guild,
            "Member Warned",
            `${interaction.user} warned ${user}.\nReason: ${reason}`
        );
    }

    if (name === "clear") {
        if (!hasModeration(interaction)) {
            return commandError(interaction, "Moderation permission required.");
        }

        const amount =
            interaction.options.getInteger("amount");

        if (!interaction.channel?.isTextBased()) {
            return commandError(interaction, "This command cannot be used here.");
        }

        const deleted =
            await interaction.channel.bulkDelete(
                amount,
                true
            );

        return interaction.reply({
            content: `🧹 Deleted ${deleted.size} message(s).`,
            ephemeral: true
        });
    }

    if (name === "ticket") {
        return createTicket(interaction);
    }

    if (name === "ticketpanel") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        const embed = new EmbedBuilder()
            .setTitle("LegacyUnlock Support")
            .setDescription(
                "Need help? Click the button below to create a private support ticket."
            )
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_create")
                .setLabel("Create Ticket")
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

    if (name === "ticketclose") {
        return closeTicket(interaction);
    }

    if (name === "ticketdelete") {
        return deleteTicket(interaction);
    }

    if (name === "ticketclaim") {
        return claimTicket(interaction);
    }

    if (name === "apply") {
        const menu = new StringSelectMenuBuilder()
            .setCustomId("application_select")
            .setPlaceholder("Choose an application")
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("Tester")
                    .setDescription("Apply for Tester")
                    .setValue("tester"),
                new StringSelectMenuOptionBuilder()
                    .setLabel("Moderator")
                    .setDescription("Apply for Moderator")
                    .setValue("moderator"),
                new StringSelectMenuOptionBuilder()
                    .setLabel("Support")
                    .setDescription("Apply for Support")
                    .setValue("support"),
                new StringSelectMenuOptionBuilder()
                    .setLabel("Developer")
                    .setDescription("Apply for Developer")
                    .setValue("developer")
            );

        return interaction.reply({
            content: "Choose the position you want to apply for.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            ephemeral: true
        });
    }

    if (name === "applicationpanel") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        return createApplicationPanel(interaction);
    }

    if (name === "applications") {
        const embed = new EmbedBuilder()
            .setTitle("LegacyUnlock Applications")
            .setColor(0x5865F2)
            .setDescription(
                `Applications use 10 questions.\n` +
                `Passing score: ${CONFIG.minimumPassingScore}/10.\n\n` +
                "**Available positions:**\n" +
                "• Tester\n" +
                "• Moderator\n" +
                "• Support\n" +
                "• Developer"
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (name === "setup") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        return setupServer(interaction);
    }

    if (name === "setlogs") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        await getOrCreateLogChannel(interaction.guild);

        return interaction.reply({
            content: `✅ ${CONFIG.logChannelName} is ready.`,
            ephemeral: true
        });
    }

    if (name === "setuptickets") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        await getOrCreateCategory(
            interaction.guild,
            CONFIG.ticketCategoryName
        );

        await getOrCreateRole(
            interaction.guild,
            CONFIG.supportRoleName
        );

        return interaction.reply({
            content: "✅ Ticket system is ready.",
            ephemeral: true
        });
    }

    if (name === "setupapplications") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        await getOrCreateCategory(
            interaction.guild,
            CONFIG.applicationCategoryName
        );

        return interaction.reply({
            content: "✅ Application system is ready.",
            ephemeral: true
        });
    }

    if (name === "security") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        const embed = new EmbedBuilder()
            .setTitle("LegacyUnlock Security")
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "Anti-Spam",
                    value: SECURITY.antiSpam ? "Enabled" : "Disabled",
                    inline: true
                },
                {
                    name: "Anti-Link",
                    value: SECURITY.antiLinks ? "Enabled" : "Disabled",
                    inline: true
                },
                {
                    name: "Anti-Slur",
                    value: SECURITY.antiSlurs ? "Enabled" : "Disabled",
                    inline: true
                },
                {
                    name: "Anti-Raid",
                    value: SECURITY.antiRaid ? "Enabled" : "Disabled",
                    inline: true
                },
                {
                    name: "Anti-Nuke",
                    value: SECURITY.antiNuke ? "Enabled" : "Disabled",
                    inline: true
                },
                {
                    name: "Punishment",
                    value: SECURITY.punishment,
                    inline: true
                }
            );

        return interaction.reply({ embeds: [embed] });
    }

    if (
        [
            "antispam",
            "antilink",
            "antislur",
            "antiraid",
            "antinuke"
        ].includes(name)
    ) {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        const enabled =
            interaction.options.getBoolean("enabled");

        if (name === "antispam") SECURITY.antiSpam = enabled;
        if (name === "antilink") SECURITY.antiLinks = enabled;
        if (name === "antislur") SECURITY.antiSlurs = enabled;
        if (name === "antiraid") SECURITY.antiRaid = enabled;
        if (name === "antinuke") SECURITY.antiNuke = enabled;

        await interaction.reply({
            content:
                `✅ ${name} has been ${enabled ? "enabled" : "disabled"}.`,
            ephemeral: true
        });

        return sendLog(
            interaction.guild,
            "Security Setting Changed",
            `${interaction.user} changed ${name} to ${enabled}.`
        );
    }

    if (name === "setpunishment") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        SECURITY.punishment =
            interaction.options.getString("type");

        return interaction.reply({
            content:
                `✅ Security punishment set to **${SECURITY.punishment}**.`,
            ephemeral: true
        });
    }

    if (name === "securitytest") {
        if (!hasAdmin(interaction)) {
            return commandError(interaction, "Administrator permission required.");
        }

        return interaction.reply({
            content:
                "🛡️ Security test successful.\n\n" +
                `Anti-Spam: ${SECURITY.antiSpam ? "ON" : "OFF"}\n` +
                `Anti-Link: ${SECURITY.antiLinks ? "ON" : "OFF"}\n` +
                `Anti-Slur: ${SECURITY.antiSlurs ? "ON" : "OFF"}\n` +
                `Anti-Raid: ${SECURITY.antiRaid ? "ON" : "OFF"}\n` +
                `Anti-Nuke: ${SECURITY.antiNuke ? "ON" : "OFF"}`
        });
    }
}

client.once("ready", async () => {
    console.log("");
    console.log("================================");
    console.log("LegacyUnlock is online.");
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot ID: ${client.user.id}`);
    console.log(`Servers: ${client.guilds.cache.size}`);
    console.log("================================");
    console.log("");

    client.user.setPresence({
        activities: [
            {
                name: `${client.guilds.cache.size} servers`,
                type: 3
            }
        ],
        status: "online"
    });

    try {
        await registerCommands();
    } catch (error) {
        console.error("COMMAND REGISTRATION FAILED:");
        console.error(error);
    }

    for (const guild of client.guilds.cache.values()) {
        try {
            await getOrCreateLogChannel(guild);
        } catch (error) {
            console.error(
                `Could not create log channel in ${guild.name}:`,
                error.message
            );
        }
    }

    console.log("Startup complete.");
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId === "ticket_create") {
                await createTicket(interaction);
                return;
            }

            if (interaction.customId === "ticket_claim") {
                await claimTicket(interaction);
                return;
            }

            if (interaction.customId === "ticket_close") {
                await closeTicket(interaction);
                return;
            }

            if (interaction.customId === "ticket_delete") {
                await deleteTicket(interaction);
                return;
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === "application_select") {
                await startApplication(
                    interaction,
                    interaction.values[0]
                );
                return;
            }
        }

        if (interaction.isModalSubmit()) {
            if (
                interaction.customId.startsWith(
                    "application_answer_"
                )
            ) {
                await handleApplicationModal(interaction);
                return;
            }
        }
    } catch (error) {
        console.error("Interaction error:", error);

        await commandError(
            interaction,
            "Something went wrong while processing that request."
        );
    }
});

client.on("messageCreate", async message => {
    try {
        if (!message.guild) return;
        if (message.author.bot) return;

        const member = message.member;

        if (
            SECURITY.antiLinks &&
            containsLink(message.content) &&
            !isStaff(member)
        ) {
            if (SECURITY.deleteBadMessages) {
                await message.delete().catch(() => {});
            }

            await punishSecurityUser(
                member,
                "Sending links while anti-link is enabled"
            );

            await securityLog(
                message.guild,
                "Anti-Link",
                `${message.author} attempted to send a link.`
            );

            return;
        }

        if (
            SECURITY.antiSlurs &&
            containsBlockedWord(message.content) &&
            !isStaff(member)
        ) {
            if (SECURITY.deleteBadMessages) {
                await message.delete().catch(() => {});
            }

            await punishSecurityUser(
                member,
                "Using blocked language"
            );

            await securityLog(
                message.guild,
                "Anti-Slur",
                `${message.author} triggered the anti-slur filter.`
            );

            return;
        }

        if (SECURITY.antiSpam && !isStaff(member)) {
            const key =
                `${message.guild.id}:${message.author.id}`;

            const now = Date.now();

            const previous =
                spamTracker.get(key) || [];

            const recent =
                previous.filter(
                    timestamp =>
                        now - timestamp <
                        SECURITY.spamTimeWindow
                );

            recent.push(now);

            spamTracker.set(key, recent);

            if (
                recent.length >=
                SECURITY.spamMessageLimit
            ) {
                spamTracker.set(key, []);

                if (SECURITY.deleteBadMessages) {
                    await message.delete().catch(() => {});
                }

                await punishSecurityUser(
                    member,
                    "Spam detected"
                );

                await securityLog(
                    message.guild,
                    "Anti-Spam",
                    `${message.author} triggered anti-spam.`
                );
            }
        }
    } catch (error) {
        console.error("messageCreate security error:", error);
    }
});

client.on("guildMemberAdd", async member => {
    try {
        if (SECURITY.antiRaid) {
            const key = member.guild.id;
            const now = Date.now();

            const joins =
                joinTracker.get(key) || [];

            const recent =
                joins.filter(
                    timestamp =>
                        now - timestamp <
                        SECURITY.raidTimeWindow
                );

            recent.push(now);

            joinTracker.set(key, recent);

            if (
                recent.length >=
                SECURITY.raidJoinLimit
            ) {
                await securityLog(
                    member.guild,
                    "Anti-Raid",
                    `A possible raid was detected: ${recent.length} members joined within ${SECURITY.raidTimeWindow / 1000} seconds.`
                );
            }
        }

        const welcomeId =
            welcomeChannels.get(member.guild.id);

        if (welcomeId) {
            const channel =
                member.guild.channels.cache.get(
                    welcomeId
                );

            if (channel?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle("Welcome!")
                    .setDescription(
                        `Welcome ${member} to **${member.guild.name}**!`
                    )
                    .setThumbnail(
                        member.user.displayAvatarURL({
                            size: 256
                        })
                    )
                    .setColor(0x57F287)
                    .setTimestamp();

                await channel.send({
                    embeds: [embed]
                });
            }
        }
    } catch (error) {
        console.error("guildMemberAdd error:", error);
    }
});

client.on("guildMemberRemove", async member => {
    try {
        await sendLog(
            member.guild,
            "Member Left",
            `${member.user.tag} left the server.`
        );
    } catch (error) {
        console.error("guildMemberRemove error:", error);
    }
});

client.on("guildCreate", async guild => {
    console.log(
        `Joined new server: ${guild.name} (${guild.id})`
    );

    try {
        await getOrCreateLogChannel(guild);

        await sendLog(
            guild,
            "LegacyUnlock Added",
            "LegacyUnlock has been added to this server."
        );
    } catch (error) {
        console.error(
            "Guild setup error:",
            error
        );
    }

    client.user.setPresence({
        activities: [
            {
                name: `${client.guilds.cache.size} servers`,
                type: 3
            }
        ],
        status: "online"
    });
});

client.on("guildDelete", guild => {
    console.log(
        `Removed from server: ${guild.name} (${guild.id})`
    );
});

client.on("error", error => {
    console.error("Discord client error:", error);
});

client.on("shardError", error => {
    console.error("Discord shard error:", error);
});

client.on("warn", warning => {
    console.warn("Discord warning:", warning);
});

client.on("debug", info => {
    if (
        info.toLowerCase().includes("4014") ||
        info.toLowerCase().includes("disallowed intent")
    ) {
        console.error("");
        console.error("DISCORD INTENT ERROR");
        console.error(
            "Enable Server Members Intent and Message Content Intent in the Discord Developer Portal."
        );
        console.error("");
    }
});

process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
    process.exit(1);
});

console.log("Starting LegacyUnlock...");

client.login(TOKEN)
    .then(() => {
        console.log("Discord login request accepted.");
    })
    .catch(error => {
        console.error("");
        console.error("DISCORD LOGIN FAILED");
        console.error(error);

        if (
            error?.code === 4014 ||
            String(error?.message)
                .toLowerCase()
                .includes("disallowed intent")
        ) {
            console.error("");
            console.error(
                "Enable these privileged intents:"
            );
            console.error(
                "1. Server Members Intent"
            );
            console.error(
                "2. Message Content Intent"
            );
            console.error(
                "Discord Developer Portal -> Bot -> Privileged Gateway Intents"
            );
        }

        process.exit(1);
    });
