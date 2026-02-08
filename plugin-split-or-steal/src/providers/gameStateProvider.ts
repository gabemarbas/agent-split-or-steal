import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { GameManager } from '../services/gameManager.js';

// Shared game manager instance — all agents in the same runtime see the same games
let sharedGameManager: GameManager | null = null;

export function getGameManager(runtime?: IAgentRuntime): GameManager {
  if (!sharedGameManager) {
    const buyIn = runtime?.getSetting('GAME_BUY_IN')
      ? Number(runtime.getSetting('GAME_BUY_IN'))
      : undefined;
    const chatRounds = runtime?.getSetting('GAME_CHAT_ROUNDS')
      ? Number(runtime.getSetting('GAME_CHAT_ROUNDS'))
      : undefined;
    const tweetDelayMs = runtime?.getSetting('GAME_TWEET_DELAY_MS')
      ? Number(runtime.getSetting('GAME_TWEET_DELAY_MS'))
      : undefined;

    sharedGameManager = new GameManager({ buyIn, chatRounds, tweetDelayMs });
  }
  return sharedGameManager;
}

/**
 * Provides game state context to the agent so it knows
 * if it's in an active game and what phase it's in.
 */
export const gameStateProvider: Provider = {
  name: 'split-or-steal-game-state',
  description: 'Provides the current Split or Steal game state for this agent',
  dynamic: true,

  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const manager = getGameManager(runtime);
    const agentId = runtime.agentId;
    const activeGame = manager.getAgentActiveGame(agentId);

    if (!activeGame) {
      const completed = manager.getCompletedGames();
      const agentGames = completed.filter(
        (g) => g.playerA.agentId === agentId || g.playerB.agentId === agentId,
      );
      const wins = agentGames.filter((g) => {
        const isA = g.playerA.agentId === agentId;
        return isA ? g.playerA.payout > 0 : g.playerB.payout > 0;
      }).length;

      return {
        text: `You are not currently in a Split or Steal game. Games played: ${agentGames.length}, Games won: ${wins}.`,
        data: { inGame: false, gamesPlayed: agentGames.length, wins },
      };
    }

    const isPlayerA = activeGame.playerA.agentId === agentId;
    const myRole = isPlayerA ? 'Player A' : 'Player B';
    const opponent = isPlayerA ? activeGame.playerB : activeGame.playerA;

    const recentChat = activeGame.chatHistory
      .slice(-6)
      .map((m) => `${m.agentName}: ${m.text}`)
      .join('\n');

    return {
      text: [
        `You are in a Split or Steal game (${activeGame.phase} phase).`,
        `You are ${myRole}. Your opponent is ${opponent.agentName}.`,
        `Pot: $${activeGame.pot}. Round: ${activeGame.currentRound}/${activeGame.chatRounds}.`,
        recentChat ? `\nRecent chat:\n${recentChat}` : '',
        activeGame.phase === 'deciding' ? '\nThe negotiation is over. You must now choose: SPLIT or STEAL.' : '',
      ].join('\n'),
      data: {
        inGame: true,
        gameId: activeGame.gameId,
        phase: activeGame.phase,
        pot: activeGame.pot,
        currentRound: activeGame.currentRound,
        totalRounds: activeGame.chatRounds,
        opponentName: opponent.agentName,
        myRole,
      },
    };
  },
};
