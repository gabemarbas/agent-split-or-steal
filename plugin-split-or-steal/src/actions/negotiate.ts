import type { Action, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getGameManager } from '../providers/gameStateProvider.js';

/**
 * NEGOTIATE action — sends a chat message during the negotiation phase.
 * Each message gets posted as a reply in the Twitter thread.
 */
export const negotiateAction: Action = {
  name: 'SPLIT_OR_STEAL_NEGOTIATE',
  similes: ['NEGOTIATE', 'CHAT_IN_GAME', 'GAME_MESSAGE'],
  description:
    'Send a negotiation message in an active Split or Steal game. Use this during the negotiation phase to try to convince, bluff, or persuade your opponent.',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const manager = getGameManager(runtime);
    const game = manager.getAgentActiveGame(runtime.agentId);
    return !!game && game.phase === 'negotiating';
  },

  handler: async (runtime, message, state, options, callback) => {
    const manager = getGameManager(runtime);
    const game = manager.getAgentActiveGame(runtime.agentId);

    if (!game) {
      return { success: false, text: 'No active game found' };
    }

    const agentName = runtime.character?.name || 'Unknown Agent';
    const negotiationText = message.content.text;

    // Add the message to the game chat
    const updatedGame = manager.addChatMessage(game.gameId, {
      agentId: runtime.agentId,
      agentName,
      text: negotiationText,
    });

    if (!updatedGame) {
      return { success: false, text: 'Failed to add chat message' };
    }

    const roundInfo = `[Round ${updatedGame.currentRound}/${updatedGame.chatRounds}]`;
    const isLastMessage = updatedGame.phase === 'deciding';

    logger.info(`Game ${game.gameId} ${roundInfo}: ${agentName} says: "${negotiationText}"`);

    if (callback) {
      await callback({
        text: negotiationText,
        data: {
          gameId: game.gameId,
          action: 'negotiation_message',
          round: updatedGame.currentRound,
          totalRounds: updatedGame.chatRounds,
          agentName,
          phaseComplete: isLastMessage,
        },
      });
    }

    // If negotiation just ended, notify that it's decision time
    if (isLastMessage) {
      logger.info(`Game ${game.gameId}: Negotiation phase complete, awaiting decisions`);
    }

    return { success: true, text: `Message sent in game ${game.gameId}` };
  },

  examples: [
    [
      {
        name: 'user',
        content: { text: "Agent B said: \"Let's both split and walk away winners.\"" },
      },
      {
        name: 'agent',
        content: {
          text: "I agree, splitting is the smart play. Let's both commit to it and walk away with our share.",
          action: 'SPLIT_OR_STEAL_NEGOTIATE',
        },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Agent A said: "I promise I will split, you can trust me."' },
      },
      {
        name: 'agent',
        content: {
          text: "That's what everyone says. How do I know you won't betray me the moment decisions are locked in?",
          action: 'SPLIT_OR_STEAL_NEGOTIATE',
        },
      },
    ],
  ],
};
