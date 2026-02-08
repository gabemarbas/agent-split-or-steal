import type { Action, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getGameManager } from '../providers/gameStateProvider.js';

/**
 * CHALLENGE action — starts a new Split or Steal game.
 * Agent A challenges Agent B and the negotiation begins.
 * Posts the opening tweet to start the Twitter thread.
 */
export const challengeAction: Action = {
  name: 'SPLIT_OR_STEAL_CHALLENGE',
  similes: ['START_GAME', 'CHALLENGE_AGENT', 'PLAY_SPLIT_OR_STEAL'],
  description:
    'Challenge another agent to a game of Split or Steal. Use this when you want to start a new game with another agent.',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const manager = getGameManager(runtime);
    // Don't allow if agent is already in a game
    const existingGame = manager.getAgentActiveGame(runtime.agentId);
    if (existingGame) {
      logger.info('Agent is already in an active game, cannot challenge');
      return false;
    }
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    const manager = getGameManager(runtime);
    const config = manager.getConfig();

    // Extract opponent info from the message or state
    // In a real deployment, this would look up the opponent agent by name/ID
    const opponentName = message.content.opponentName || message.content.text?.match(/challenge (\w+)/i)?.[1];

    if (!opponentName) {
      if (callback) {
        await callback({
          text: 'Who do you want to challenge? Specify an opponent agent name.',
        });
      }
      return { success: false, text: 'No opponent specified' };
    }

    // Create the game
    const game = manager.createGame(
      {
        agentId: runtime.agentId,
        agentName: runtime.character?.name || 'Agent A',
      },
      {
        agentId: message.content.opponentId || `opponent-${opponentName}`,
        agentName: opponentName,
      },
      message.roomId,
    );

    // Build the announcement tweet
    const announcement = [
      `I just challenged ${opponentName} to Split or Steal!`,
      ``,
      `$${game.pot} is on the line.`,
      ``,
      `Rules: We negotiate, then privately choose SPLIT or STEAL.`,
      `- Both SPLIT → we each get $${game.pot / 2}`,
      `- One STEALS → they take all $${game.pot}`,
      `- Both STEAL → nobody gets anything`,
      ``,
      `The negotiation starts now...`,
    ].join('\n');

    logger.info(`Game ${game.gameId} started: ${runtime.character?.name} vs ${opponentName}`);

    if (callback) {
      await callback({
        text: announcement,
        data: {
          gameId: game.gameId,
          action: 'game_started',
          pot: game.pot,
          playerA: runtime.character?.name,
          playerB: opponentName,
        },
      });
    }

    return { success: true, text: `Game ${game.gameId} started` };
  },

  examples: [
    [
      {
        name: 'user',
        content: { text: 'Challenge Agent B to Split or Steal' },
      },
      {
        name: 'agent',
        content: {
          text: 'I just challenged Agent B to Split or Steal! $20 is on the line. The negotiation starts now...',
          action: 'SPLIT_OR_STEAL_CHALLENGE',
        },
      },
    ],
  ],
};
