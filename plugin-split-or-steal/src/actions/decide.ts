import type { Action, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { getGameManager } from '../providers/gameStateProvider.js';
import type { GameChoice } from '../types/index.js';

/**
 * DECIDE action — submit a private SPLIT or STEAL decision.
 * This happens after the negotiation phase ends.
 */
export const decideAction: Action = {
  name: 'SPLIT_OR_STEAL_DECIDE',
  similes: ['MAKE_DECISION', 'CHOOSE_SPLIT_OR_STEAL', 'SUBMIT_CHOICE'],
  description:
    'Submit your final SPLIT or STEAL decision in a Split or Steal game. Use this when the negotiation phase is over and you need to make your private choice.',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const manager = getGameManager(runtime);
    const game = manager.getAgentActiveGame(runtime.agentId);
    return !!game && game.phase === 'deciding';
  },

  handler: async (runtime, message, state, options, callback) => {
    const manager = getGameManager(runtime);
    const game = manager.getAgentActiveGame(runtime.agentId);

    if (!game) {
      return { success: false, text: 'No active game in decision phase' };
    }

    // Parse the decision from the message
    const text = message.content.text?.toUpperCase() || '';
    let choice: GameChoice;

    if (text.includes('STEAL')) {
      choice = 'STEAL';
    } else if (text.includes('SPLIT')) {
      choice = 'SPLIT';
    } else {
      if (callback) {
        await callback({
          text: 'You must choose SPLIT or STEAL. What is your final decision?',
        });
      }
      return { success: false, text: 'Invalid decision' };
    }

    const agentName = runtime.character?.name || 'Unknown Agent';
    logger.info(`Game ${game.gameId}: ${agentName} chose ${choice}`);

    // Record the decision
    const updatedGame = manager.recordDecision(game.gameId, runtime.agentId, choice);

    if (!updatedGame) {
      return { success: false, text: 'Failed to record decision' };
    }

    // If the game is now resolved, announce results
    if (updatedGame.phase === 'resolved') {
      const resultText = formatResult(updatedGame);

      logger.info(`Game ${game.gameId} resolved: ${resultText}`);

      if (callback) {
        await callback({
          text: resultText,
          data: {
            gameId: game.gameId,
            action: 'game_resolved',
            playerA: {
              name: updatedGame.playerA.agentName,
              choice: updatedGame.playerA.choice,
              payout: updatedGame.playerA.payout,
            },
            playerB: {
              name: updatedGame.playerB.agentName,
              choice: updatedGame.playerB.choice,
              payout: updatedGame.playerB.payout,
            },
          },
        });
      }
    } else {
      // Waiting for opponent's decision
      if (callback) {
        await callback({
          text: `Decision locked in. Waiting for ${
            updatedGame.playerA.agentId === runtime.agentId
              ? updatedGame.playerB.agentName
              : updatedGame.playerA.agentName
          } to decide...`,
          data: {
            gameId: game.gameId,
            action: 'decision_submitted',
            choice,
          },
        });
      }
    }

    return { success: true, text: `Decision recorded: ${choice}` };
  },

  examples: [
    [
      {
        name: 'user',
        content: { text: 'The negotiation is over. Make your final choice: SPLIT or STEAL.' },
      },
      {
        name: 'agent',
        content: {
          text: 'SPLIT',
          action: 'SPLIT_OR_STEAL_DECIDE',
        },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Time to decide. SPLIT or STEAL?' },
      },
      {
        name: 'agent',
        content: {
          text: 'STEAL',
          action: 'SPLIT_OR_STEAL_DECIDE',
        },
      },
    ],
  ],
};

function formatResult(game: {
  playerA: { agentName: string; choice?: string; payout: number };
  playerB: { agentName: string; choice?: string; payout: number };
  pot: number;
}): string {
  const lines = [
    `THE RESULTS ARE IN!`,
    ``,
    `${game.playerA.agentName} chose: ${game.playerA.choice}`,
    `${game.playerB.agentName} chose: ${game.playerB.choice}`,
    ``,
  ];

  if (game.playerA.choice === 'SPLIT' && game.playerB.choice === 'SPLIT') {
    lines.push(`Both agents cooperated! They each walk away with $${game.pot / 2}.`);
  } else if (game.playerA.choice === 'STEAL' && game.playerB.choice === 'STEAL') {
    lines.push(`Both agents got greedy. Nobody gets anything.`);
  } else if (game.playerA.choice === 'STEAL') {
    lines.push(`${game.playerA.agentName} BETRAYED ${game.playerB.agentName} and took the entire $${game.pot}!`);
  } else {
    lines.push(`${game.playerB.agentName} BETRAYED ${game.playerA.agentName} and took the entire $${game.pot}!`);
  }

  return lines.join('\n');
}
