const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const { joinVoiceChannel, createAudioResource, createAudioPlayer, AudioPlayerStatus } = require('@discordjs/voice');
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Define the command structure
const commands = [
  new SlashCommandBuilder()
    .setName('zplay')
    .setDescription('Play a song from YouTube')
    .addStringOption((option: { setName: (arg0: string) => { (): any; new(): any; setDescription: { (arg0: string): { (): any; new(): any; setRequired: { (arg0: boolean): any; new(): any; }; }; new(): any; }; }; }) => 
      option.setName('song').setDescription('The name of the song to play').setRequired(true))
    .toJSON(),
];

// Prepare the REST API with your bot's token
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Failed to register application commands:', error);
  }
});

client.on('interactionCreate', async (interaction: { isCommand: () => any; commandName: string; deferReply: () => any; editReply: (arg0: { content: string; }) => any; }) => {
  if (!interaction.isCommand() || interaction.commandName !== 'zplay') return;

  await interaction.deferReply();
  const result = await processCommand(interaction);
  await interaction.editReply({ content: result });
});

async function processCommand(interaction: { isCommand?: () => any; commandName?: string; deferReply?: () => any; editReply?: (arg0: { content: string; }) => any; options?: any; member?: any; guild?: any; followUp?: any; }) {
  const songQuery = interaction.options.getString('song', true);
  const searchResult = await ytSearch(songQuery);
  if (searchResult.videos.length === 0) {
    return 'No videos found.';
  }

  const video = searchResult.videos[0];
  const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  const streamOptions = { filter: 'audioonly', highWaterMark: 1 << 25 }; // Increased buffer size
  const stream = ytdl(videoUrl, streamOptions);

  const member = interaction.member;
  if (!member.voice.channelId) {
    return 'You must be in a voice channel to play music.';
  }

  const voiceChannel = await interaction.guild.channels.fetch(member.voice.channelId).catch(console.error);
  if (!voiceChannel || ![2, 13].includes(voiceChannel.type)) {
    console.error(`Failed to find the voice channel or invalid type: ${voiceChannel ? voiceChannel.type : 'Channel not found'}`);
    return 'Could not find your voice channel or it is not a recognized type.';
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  const resource = createAudioResource(stream);
  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Playing, () => {
    interaction.followUp({ content: `Now playing: **${video.title}**` });
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('Stream finished.');
    connection.destroy();
  });

  player.on('error', (error: { message: any; }) => {
    console.error(`Error in audio player: ${error.message}`);
    connection.destroy();
  });

  stream.on('error', (error: { message: any; }) => {
    console.error(`Stream error: ${error.message}`);
    connection.destroy();
  });

  return `Started playing: **${video.title}**`;
}

client.login(process.env.DISCORD_TOKEN);
